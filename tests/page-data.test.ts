import {afterEach,describe,expect,it,vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {annotateData,installDataHooks} from '../src/scripts/page-data';
import type {PageState} from '../src/scripts/page-state';
const environments:JSDOM[]=[];
afterEach(()=>{for(const dom of environments.splice(0))dom.window.close()});
function setup(response=new Response('{}')){
 const dom=new JSDOM('<html><head></head><body></body></html>',{url:'https://www.youtube.com/results?search_query=topic'});environments.push(dom);
 const w=dom.window as unknown as Window & typeof globalThis;
 const native=vi.fn(async()=>response);Object.assign(w,{fetch:native,Request,Response,Headers,URL});
 const state:PageState={enabled:true,generation:1,ready:Promise.resolve(),settings:{filterData:{title:[['spoiler','i','blur']],channelName:[],channelId:[],videoId:[],comment:[],vidLength:[null,null]},options:{youblock_mode:'blur'}}};
 return {w,native,state};
}
describe('independent response metadata matching',()=>{
 it('matches nested cards independently and never borrows a child title for its shelf',()=>{
  const {w,state}=setup();const payload:any={contents:[{shelfRenderer:{title:{simpleText:'A safe shelf'},contents:[{videoRenderer:{videoId:'one',title:{simpleText:'Spoiler ending'}}},{videoRenderer:{videoId:'two',title:{simpleText:'A quiet garden'}}}]}}]};
  annotateData(payload,state,w);const shelf=payload.contents[0].shelfRenderer;
  expect(shelf.__youblockAction).toBeUndefined();expect(shelf.contents[0].videoRenderer.__youblockAction).toBe('blur');expect(shelf.contents[1].videoRenderer.__youblockAction).toBeUndefined();
 });
 it('matches a panel own heading, author IDs and modern comment content',()=>{
  const {w,state}=setup();state.settings!.filterData.channelId=[['^UC-blocked$','','hide']];state.settings!.filterData.comment=[['spoiler','i','blur']];
  const data:any={universalWatchCardRenderer:{header:{watchCardRichHeaderRenderer:{title:{simpleText:'Spoiler collection'}}}},watchCardCompactVideoRenderer:{title:{simpleText:'Safe'},byline:{runs:[{text:'Author',navigationEndpoint:{browseEndpoint:{browseId:'UC-blocked'}}}]}},commentEntityPayload:{properties:{content:{content:'Spoiler comment'}},author:{displayName:'Another author'}}};
  annotateData(data,state,w);expect(data.universalWatchCardRenderer.__youblockAction).toBe('blur');expect(data.watchCardCompactVideoRenderer.__youblockAction).toBe('hide');expect(data.commentEntityPayload.__youblockAction).toBe('blur');
 });
 it('re-evaluates retained payloads and removes marks for disabled or changed rules',()=>{
  const {w,state}=setup();const hook=installDataHooks(w,state);const data:any={videoRenderer:{videoId:'one',title:{simpleText:'Spoiler ending'}}};
  hook.refreshData(data);expect(data.videoRenderer.__youblockGeneration).toBe(1);
  state.settings!.filterData.title=[];state.generation=2;w.dispatchEvent(new w.Event('youblock-settings'));expect(data.videoRenderer.__youblockAction).toBeUndefined();
  state.settings!.filterData.title=[['spoiler','i','hide']];hook.refreshData(data);expect(data.videoRenderer.__youblockAction).toBe('hide');
  state.enabled=false;hook.refreshData(data);expect(data.videoRenderer.__youblockAction).toBeUndefined();hook.dispose();
 });
 it('applies section, duration, watched, history and recommendation-only controls',()=>{
  const {w,state}=setup();state.settings!.options.shorts=true;state.settings!.options.mixes=true;state.settings!.options.trending=true;state.settings!.options.percent_watched_hide=70;
  state.settings!.filterData.vidLength=[60,300];
  const data:any={reelItemRenderer:{videoId:'short'},radioRenderer:{title:{simpleText:'Mix'}},guideEntryRenderer:{title:{simpleText:'Explore'},navigationEndpoint:{browseEndpoint:{browseId:'FEexplore'}}},videoRenderer:{videoId:'watched',title:{simpleText:'Safe'},lengthText:{simpleText:'2:00'},thumbnailOverlays:[{thumbnailOverlayResumePlaybackRenderer:{percentDurationWatched:80}}]},compactVideoRenderer:{videoId:'brief',title:{simpleText:'Brief'},lengthText:{simpleText:'0:20'}}};
  annotateData(data,state,w);expect(data.reelItemRenderer.__youblockAction).toBe('blur');expect(data.radioRenderer.__youblockAction).toBe('blur');expect(data.guideEntryRenderer.__youblockAction).toBe('hide');expect(data.videoRenderer.__youblockAction).toBe('blur');expect(data.compactVideoRenderer.__youblockAction).toBe('blur');
  state.settings!.options.suggestions_only=true;const player:any={videoDetails:{videoId:'one',title:'Spoiler'}};annotateData(player,state,w);expect(player.videoDetails.__youblockAction).toBeUndefined();
  w.history.replaceState(null,'','/feed/history');state.settings!.options.disable_on_history=true;annotateData(data,state,w);expect(data.videoRenderer.__youblockAction).toBeUndefined();
 });
 it('keeps valid rules when an advanced predicate throws and keeps Hide priority',()=>{
  const {w,state}=setup();state.settings!.options.enable_javascript=true;const errors=vi.fn();w.addEventListener('youblock-predicate-error',errors);
  (w as any).__youblockPredicate=()=>{throw Error('bad predicate')};const data:any={videoRenderer:{title:{simpleText:'Spoiler'},videoId:'one'}};annotateData(data,state,w);expect(data.videoRenderer.__youblockAction).toBe('blur');expect(errors).toHaveBeenCalledOnce();
  state.settings!.filterData.videoId=[['^one$','','hide']];(w as any).__youblockPredicate=()=> 'blur';annotateData(data,state,w);expect(data.videoRenderer.__youblockAction).toBe('hide');
 });
});
describe('independent early data hooks',()=>{
 it('waits for supplied readiness and transforms same-origin string and Request fetches',async()=>{
  const {w,state,native}=setup(new Response('{"videoRenderer":{"title":{"simpleText":"Spoiler"},"videoId":"one"}}',{status:201,statusText:'Created',headers:{'x-test':'preserved','content-length':'72'}}));
  let ready!:()=>void;state.ready=new Promise(resolve=>ready=resolve);const hook=installDataHooks(w,state);
  let settled=false;const result=w.fetch('/youtubei/v1/search').then(r=>{settled=true;return r});await Promise.resolve();expect(settled).toBe(false);ready();
  const response=await result;expect(native).toHaveBeenCalledWith('/youtubei/v1/search',undefined);expect(response.status).toBe(201);expect(response.statusText).toBe('Created');expect(response.headers.get('x-test')).toBe('preserved');expect(response.headers.get('content-length')).toBeNull();expect((await response.json()).videoRenderer.__youblockAction).toBe('blur');
  const request=new Request('https://www.youtube.com/youtubei/v1/next');const second=await w.fetch(request);expect((await second.json()).videoRenderer.__youblockAction).toBe('blur');hook.dispose();
 });
 it('passes unsuccessful responses, bad JSON and foreign origins through unchanged',async()=>{
  const bad=new Response('temporary unavailable');const {w,state,native}=setup(bad);const hook=installDataHooks(w,state);expect(await w.fetch('/youtubei/v1/search')).toBe(bad);
  const blocked=new Response('denied',{status:403});native.mockResolvedValue(blocked);expect(await w.fetch('/youtubei/v1/search')).toBe(blocked);
  const foreign=new Response('{"title":"Spoiler"}');native.mockResolvedValue(foreign);expect(await w.fetch('https://example.com/youtubei/v1/search')).toBe(foreign);expect(await foreign.text()).toContain('Spoiler');hook.dispose();
 });
 it('hooks assigned initial globals and refreshes data already present before filters',async()=>{
  const {w,state}=setup();const data:any={videoRenderer:{title:{simpleText:'Spoiler'},videoId:'one'}};(w as any).ytInitialData=data;state.settings=undefined;
  let ready!:()=>void;state.ready=new Promise(resolve=>ready=resolve);const hook=installDataHooks(w,state);expect(data.videoRenderer.__youblockAction).toBeUndefined();
  state.settings={filterData:{title:[['spoiler','i','hide']]},options:{}};ready();await Promise.resolve();expect(data.videoRenderer.__youblockAction).toBe('hide');
  const player:any={videoDetails:{videoId:'two',title:'Spoiler preview'}};(w as any).ytInitialPlayerResponse=player;expect(player.videoDetails.__youblockAction).toBe('hide');hook.dispose();expect((w as any).ytInitialData).toBe(data);
 });
 it('restores native hooks and stops mutating after disposal',async()=>{
  const {w,state,native}=setup();const originalOpen=w.XMLHttpRequest.prototype.open;const hook=installDataHooks(w,state);expect(w.fetch).not.toBe(native);hook.dispose();expect(w.fetch).toBe(native);expect(w.XMLHttpRequest.prototype.open).toBe(originalOpen);
  const data:any={videoRenderer:{title:{simpleText:'Spoiler'}}};hook.refreshData(data);expect(data.videoRenderer.__youblockAction).toBeUndefined();
 });
});

it('treats channel cards as author identities instead of video titles',()=>{
 const {w,state}=setup();state.settings!.filterData.channelName=[['^Filtered author$','','hide']];
 const data:any={gridChannelRenderer:{channelId:'UC-one',title:{simpleText:'Filtered author'}},compactChannelRenderer:{channelId:'UC-two',title:{simpleText:'Spoiler'}}};
 annotateData(data,state,w);expect(data.gridChannelRenderer.__youblockAction).toBe('hide');expect(data.compactChannelRenderer.__youblockAction).toBeUndefined();
});

it('transforms synchronous XHR text and refreshes cached text when rules change',()=>{
 const {w,state}=setup();
 class NativeXHR {
  readyState=0;status=200;responseType='';raw='';
  open(){this.readyState=1}
  get responseText(){return this.raw}
  get response(){return this.responseType==='json'?JSON.parse(this.raw):this.raw}
 }
 (w as any).XMLHttpRequest=NativeXHR;const hook=installDataHooks(w,state);
 const request=new (w as any).XMLHttpRequest();request.open('GET','/youtubei/v1/search');request.raw='{"videoRenderer":{"videoId":"one","title":{"simpleText":"Spoiler"}}}';request.readyState=4;
 expect(JSON.parse(request.responseText).videoRenderer.__youblockAction).toBe('blur');
 state.settings!.filterData.title=[];state.generation++;
 expect(JSON.parse(request.responseText).videoRenderer.__youblockAction).toBeUndefined();
 request.responseType='json';state.settings!.filterData.title=[['spoiler','i','hide']];state.generation++;
 expect(request.response.videoRenderer.__youblockAction).toBe('hide');hook.dispose();expect(Object.prototype.hasOwnProperty.call(request,'responseText')).toBe(false);
});

it('does not let a frozen record or hostile getter disable neighboring cards',()=>{
 const {w,state}=setup();const poisoned:any={};Object.defineProperty(poisoned,'title',{enumerable:true,get(){throw Error('unreadable')}});
 const data:any={contents:[{videoRenderer:Object.freeze({title:{simpleText:'Spoiler'}})},{videoRenderer:poisoned},{videoRenderer:{title:{simpleText:'Spoiler'},videoId:'valid'}}]};
 expect(()=>annotateData(data,state,w)).not.toThrow();expect(data.contents[2].videoRenderer.__youblockAction).toBe('blur');
});

it('preserves direct channel identity across refresh and settings changes',()=>{
 const {w,state}=setup();const hook=installDataHooks(w,state);
 const direct:any={channelId:'UC-safe',title:{simpleText:'Spoiler'}};
 hook.refreshData(direct,'gridChannelRenderer');expect(direct.__youblockAction).toBeUndefined();
 state.generation++;w.dispatchEvent(new w.Event('youblock-settings'));expect(direct.__youblockAction).toBeUndefined();
 state.settings!.filterData.channelName=[['^Spoiler$','','blur']];hook.refreshData(direct);expect(direct.__youblockAction).toBe('blur');
 state.settings!.filterData.channelId=[['^UC-safe$','','hide']];hook.refreshData(direct);expect(direct.__youblockAction).toBe('hide');hook.dispose();
});

it('keeps source renderer kind for direct and settings refresh, including serialized payloads',()=>{
 const {w,state}=setup();state.settings!.filterData.title=[];state.settings!.options.enable_javascript=true;
 (w as any).__youblockPredicate=(_meta:unknown,kind:string)=>kind==='videoRenderer';
 const hook=installDataHooks(w,state),payload:any={videoRenderer:{videoId:'one',title:{simpleText:'A safe title'}}};
 hook.refreshData(payload);expect(payload.videoRenderer.__youblockAction).toBe('blur');
 hook.refreshData(payload.videoRenderer);expect(payload.videoRenderer.__youblockAction).toBe('blur');
 const serialized=JSON.parse(JSON.stringify(payload.videoRenderer));hook.refreshData(serialized);expect(serialized.__youblockAction).toBe('blur');
 state.generation++;w.dispatchEvent(new w.Event('youblock-settings'));expect(payload.videoRenderer.__youblockGeneration).toBe(state.generation);expect(serialized.__youblockAction).toBe('blur');
 hook.dispose();
});

it('lets explicit DOM renderer kind replace an outdated source kind on a reused object',()=>{
 const {w,state}=setup();const hook=installDataHooks(w,state);
 const direct:any={channelId:'UC-safe',title:{simpleText:'Spoiler'},__youblockKind:'videoRenderer'};
 hook.refreshData(direct,'gridChannelRenderer');expect(direct.__youblockKind).toBe('gridChannelRenderer');expect(direct.__youblockAction).toBeUndefined();
 hook.refreshData(direct);expect(direct.__youblockAction).toBeUndefined();
 hook.refreshData({videoRenderer:direct});expect(direct.__youblockKind).toBe('gridChannelRenderer');expect(direct.__youblockAction).toBeUndefined();hook.dispose();
});
