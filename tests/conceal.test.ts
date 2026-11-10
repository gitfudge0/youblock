// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {decideAction, installConcealment, metadata, nextAllowedVideo, actionFor} from '../src/scripts/conceal';
const win=window as any;
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
const settings=(action='blur')=>({filterData:{title:[['spoiler','i',action]],channelName:[],channelId:[],videoId:[],comment:[]},options:{youblock_mode:'blur'}});
let controller:ReturnType<typeof installConcealment>;
beforeEach(()=>{win.__youblockConcealment?.dispose();document.body.innerHTML='';win.__youblockEnabled=true;win.__youblockSettings=settings();controller=installConcealment(win)});
afterEach(()=>{controller.dispose();delete win.ytInitialPlayerResponse;delete win.__youblockGeneration;vi.restoreAllMocks();vi.useRealTimers()});
describe('concealment',()=>{
 it('gives hide precedence and ignores invalid regex without losing valid rules',()=>{
  const s=settings();s.filterData.title.push(['[','i','hide'],['spoiler','i','hide']);
  expect(decideAction(s,{title:'Spoiler for tomorrow'},false)).toBe('hide');
  expect(decideAction(s,{title:'Spoiler for tomorrow'},true)).toBeUndefined();
 });
 it('conceals identifying labels and child interactions until explicit reveal',async()=>{
  document.body.innerHTML='<ytd-video-renderer aria-label="spoiler identity"><a href="/watch?v=one"><h3>Spoiler</h3></a></ytd-video-renderer>';
  await turn();const node=document.querySelector('ytd-video-renderer')!;
  expect(node.getAttribute('data-yb-action')).toBe('blur');expect(node.hasAttribute('aria-label')).toBe(false);
  expect(node.querySelector('a')?.hasAttribute('inert')).toBe(true);
  node.querySelector('button')!.click();expect(node.hasAttribute('data-yb-action')).toBe(false);
  expect(node.getAttribute('aria-label')).toBe('spoiler identity');expect(node.querySelector('a')?.hasAttribute('inert')).toBe(false);
  controller.rescan();await turn();expect(node.hasAttribute('data-yb-action')).toBe(false);
 });
 it('restores removed matches and detects recycled cards',async()=>{
  document.body.innerHTML='<ytd-video-renderer><a href="/watch?v=one"><h3>Spoiler</h3></a></ytd-video-renderer>';
  await turn();const node=document.querySelector('ytd-video-renderer')!;
  expect(node.hasAttribute('data-yb-action')).toBe(true);
  node.querySelector('h3')!.textContent='A quiet afternoon';node.querySelector('a')!.setAttribute('href','/watch?v=two');await turn();
  expect(node.hasAttribute('data-yb-action')).toBe(false);
  node.querySelector('h3')!.textContent='Spoiler';await turn();expect(node.hasAttribute('data-yb-action')).toBe(true);
  win.__youblockEnabled=false;controller.rescan();await turn();expect(node.hasAttribute('data-yb-action')).toBe(false);
 });
 it('matches comment content and preserves original accessibility attributes',async()=>{
  win.__youblockSettings={filterData:{comment:[['spoiler','i','blur']]},options:{}};
  document.body.innerHTML='<ytd-comment-renderer><div id="content-text" aria-hidden="false">Spoiler</div></ytd-comment-renderer>';
  await turn();const node=document.querySelector('ytd-comment-renderer')!;expect(node.getAttribute('data-yb-action')).toBe('blur');
  win.__youblockSettings={filterData:{},options:{}};controller.rescan();await turn();expect(node.querySelector('#content-text')?.getAttribute('aria-hidden')).toBe('false');
 });
 it('ignores old annotations when the settings generation changes',()=>{
  const node=document.createElement('ytd-video-renderer');(node as any).data={videoRenderer:{videoId:'one',__youblockAction:'hide',__youblockGeneration:1}};
  expect(metadata(node,window.location).markGeneration).toBe(1);
 });
 it('mutes only media inside concealed items and restores previous mute state',async()=>{
  const pause=vi.spyOn(window.HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  document.body.innerHTML='<video id="unrelated"></video><ytd-video-renderer><a href="/watch?v=one"><h3>Spoiler</h3></a><video></video></ytd-video-renderer>';
  await turn();const blocked=document.querySelector('ytd-video-renderer video') as HTMLVideoElement;
  expect(blocked.muted).toBe(true);expect((document.querySelector('#unrelated') as HTMLVideoElement).muted).toBe(false);expect(pause).toHaveBeenCalled();
  win.__youblockEnabled=false;controller.rescan();await turn();expect(blocked.muted).toBe(false);
 });
});

describe('autoplay candidate selection',()=>{
 it('skips blocked playlist entries and preserves the permitted entry URL',()=>{
  document.body.innerHTML=`<ytd-playlist-panel-video-renderer><a href="/watch?v=current&list=PL"><h3>Current</h3></a></ytd-playlist-panel-video-renderer><ytd-playlist-panel-video-renderer><a href="/watch?v=blocked&list=PL"><h3>Spoiler</h3></a></ytd-playlist-panel-video-renderer><ytd-playlist-panel-video-renderer><a href="/watch?v=allowed&list=PL&index=3"><h3>A quiet afternoon</h3></a></ytd-playlist-panel-video-renderer>`;
  expect(nextAllowedVideo(document,settings(),'https://www.youtube.com/watch?v=current&list=PL')).toBe('https://www.youtube.com/watch?v=allowed&list=PL&index=3');
 });
 it('does not guess when required channel identity is unavailable or a target was already skipped',()=>{
  document.body.innerHTML='<div id="related"><ytd-compact-video-renderer><a href="/watch?v=allowed"><h3>A quiet afternoon</h3></a></ytd-compact-video-renderer></div>';
  const s:any=settings();s.filterData.channelId=[['^blocked$','','hide']];
  expect(nextAllowedVideo(document,s,'https://www.youtube.com/watch?v=current')).toBeUndefined();
  s.filterData.channelId=[];expect(nextAllowedVideo(document,s,'https://www.youtube.com/watch?v=current',undefined,new Set(['allowed']))).toBeUndefined();
 });
});


describe('watch page identity',()=>{
 it('matches exact channel ID and duration from a current player response when owner uses a handle',()=>{
  document.body.innerHTML='<ytd-watch-flexy><div id="columns"><div id="primary"><h1>Stale DOM title</h1><div id="owner"><div id="channel-name"><a href="/@handle">Channel</a></div></div></div></div></ytd-watch-flexy>';
  win.ytInitialPlayerResponse={videoDetails:{videoId:'current',channelId:'UC-exact',title:'Current player title',author:'Exact channel',lengthSeconds:'180'}};
  const node=document.querySelector('#primary') as HTMLElement;
  const info=metadata(node,new URL('https://www.youtube.com/watch?v=current'));
  expect(info.values).toMatchObject({videoId:'current',channelId:'UC-exact',title:'Current player title',channelName:'Exact channel',duration:'3:00'});
  const s:any=settings();s.filterData.channelId=[['^UC-exact$','','hide']];
  expect(actionFor(node,info,s,'/watch')).toBe('hide');
  s.filterData.channelId=[];s.filterData.vidLength=[null,120];
  expect(actionFor(node,info,s,'/watch')).toBe('blur');
 });
 it('does not apply stale initial-player identity after SPA navigation',()=>{
  document.body.innerHTML='<ytd-watch-flexy><div id="columns"><div id="primary"><h1>New page title</h1></div></div></ytd-watch-flexy>';
  win.ytInitialPlayerResponse={videoDetails:{videoId:'old',channelId:'UC-old',title:'Old player title',lengthSeconds:'180'}};
  const info=metadata(document.querySelector('#primary') as HTMLElement,new URL('https://www.youtube.com/watch?v=current'));
  expect(info.values.videoId).toBe('current');expect(info.values.channelId||'').toBe('');expect(info.values.title).toBe('New page title');expect(info.values.duration||'').toBe('');
 });
 it('uses current watch-flexy secondary-owner data without a primary node data property',()=>{
  document.body.innerHTML='<ytd-watch-flexy><div id="columns"><div id="primary"></div></div></ytd-watch-flexy>';
  const host=document.querySelector('ytd-watch-flexy') as any;
  host.data={currentVideoEndpoint:{watchEndpoint:{videoId:'current'}},contents:{twoColumnWatchNextResults:{results:{results:{contents:[{videoPrimaryInfoRenderer:{title:{simpleText:'Current title'}}},{videoSecondaryInfoRenderer:{owner:{videoOwnerRenderer:{title:{simpleText:'Current channel'},navigationEndpoint:{browseEndpoint:{browseId:'UC-current'}}}}}}]}}}}};
  const info=metadata(document.querySelector('#primary') as HTMLElement,new URL('https://www.youtube.com/watch?v=current'));
  expect(info.values).toMatchObject({channelId:'UC-current',channelName:'Current channel',title:'Current title'});
  host.data.currentVideoEndpoint.watchEndpoint.videoId='old';
  expect(metadata(document.querySelector('#primary') as HTMLElement,new URL('https://www.youtube.com/watch?v=current')).values.channelId||'').toBe('');
 });
 it('does not reveal unrelated anonymous marked cards with an empty metadata key',async()=>{
  win.__youblockGeneration=1;
  const one=document.createElement('ytd-video-renderer'),two=document.createElement('ytd-video-renderer');
  for(const node of [one,two]){(node as any).data={__youblockAction:'blur',__youblockGeneration:1};document.body.append(node)}
  await turn();expect(metadata(one,window.location).key).not.toBe(metadata(two,window.location).key);
  one.querySelector('button')!.click();controller.rescan();await turn();
  expect(one.hasAttribute('data-yb-action')).toBe(false);expect(two.getAttribute('data-yb-action')).toBe('blur');
 });
});

describe('retained renderer families',()=>{
 it('hides standalone desktop and mobile grid playlists by retained annotation',async()=>{
  win.__youblockGeneration=3;
  for(const name of ['ytd-grid-playlist-renderer','ytm-grid-playlist-renderer','ytd-end-screen-playlist-renderer']){
   const node=document.createElement(name);(node as any).data={__youblockAction:'hide',__youblockGeneration:3};document.body.append(node);
  }
  await turn();expect(document.querySelectorAll('[data-yb-action="hide"]')).toHaveLength(3);
 });
 it('matches standalone grid and compact channels by channel identity rather than video title',async()=>{
  win.__youblockSettings={filterData:{channelName:[['^Filtered channel$','i','hide']],title:[['Unrelated','i','hide']]},options:{}};
  const one=document.createElement('ytd-grid-channel-renderer'),two=document.createElement('ytm-compact-channel-renderer');
  (one as any).data={channelId:'UC-one',title:{simpleText:'Filtered channel'}};
  (two as any).data={channelId:'UC-two',displayName:'Unrelated creator'};
  document.body.append(one,two);await turn();
  expect(one.getAttribute('data-yb-action')).toBe('hide');expect(two.hasAttribute('data-yb-action')).toBe(false);
 });
 it('does not conceal an entire shelf because one nested card matches',async()=>{
  win.__youblockSettings=settings('hide');
  document.body.innerHTML='<ytd-rich-shelf-renderer><h3>A shelf</h3><ytd-video-renderer><a href="/watch?v=one"><h3>Spoiler</h3></a></ytd-video-renderer><ytd-video-renderer><a href="/watch?v=two"><h3>A quiet afternoon</h3></a></ytd-video-renderer></ytd-rich-shelf-renderer>';
  const shelf=document.querySelector('ytd-rich-shelf-renderer') as any;
  shelf.data={videoRenderer:{__youblockAction:'hide'}};
  await turn();const children=shelf.querySelectorAll('ytd-video-renderer');
  expect(shelf.hasAttribute('data-yb-action')).toBe(false);expect(children[0].getAttribute('data-yb-action')).toBe('hide');expect(children[1].hasAttribute('data-yb-action')).toBe(false);
 });
 it('honors a shelf own annotation and restores it when the rule is removed',async()=>{
  const shelf=document.createElement('ytm-rich-shelf-renderer');win.__youblockGeneration=1;
  (shelf as any).data={richShelfRenderer:{__youblockAction:'hide',__youblockGeneration:1}};document.body.append(shelf);await turn();
  expect(shelf.getAttribute('data-yb-action')).toBe('hide');
  win.__youblockGeneration=2;controller.rescan();await turn();expect(shelf.hasAttribute('data-yb-action')).toBe(false);
 });
});


describe('search watch panels',()=>{
 it('matches a panel by its own heading and restores it on changes',async()=>{
  document.body.innerHTML='<ytd-universal-watch-card-renderer><ytd-watch-card-rich-header-renderer><div id="title">Spoiler collection</div></ytd-watch-card-rich-header-renderer><ytd-watch-card-hero-video-renderer><a href="/watch?v=hero"><div class="title">A safe title</div></a></ytd-watch-card-hero-video-renderer></ytd-universal-watch-card-renderer>';
  const panel=document.querySelector('ytd-universal-watch-card-renderer') as any;
  panel.data={header:{watchCardRichHeaderRenderer:{title:{simpleText:'Spoiler collection'}}}};
  await turn();expect(panel.getAttribute('data-yb-action')).toBe('blur');
  panel.querySelector('#title').textContent='Safe collection';panel.data.header.watchCardRichHeaderRenderer.title.simpleText='Safe collection';
  await turn();expect(panel.hasAttribute('data-yb-action')).toBe(false);
 });
 it('filters hero and compact children independently without blocking a safe sibling or whole panel',async()=>{
  document.body.innerHTML='<ytd-universal-watch-card-renderer><ytd-watch-card-rich-header-renderer><div id="title">Safe collection</div></ytd-watch-card-rich-header-renderer><ytd-watch-card-hero-video-renderer><a href="/watch?v=hero"><div class="title">Spoiler hero</div></a></ytd-watch-card-hero-video-renderer><ytd-watch-card-compact-video-renderer><a href="/watch?v=one"><div class="title">Spoiler compact</div></a></ytd-watch-card-compact-video-renderer><ytd-watch-card-compact-video-renderer><a href="/watch?v=two"><div class="title">Safe sibling</div></a></ytd-watch-card-compact-video-renderer></ytd-universal-watch-card-renderer>';
  await turn();const panel=document.querySelector('ytd-universal-watch-card-renderer')!;
  expect(panel.hasAttribute('data-yb-action')).toBe(false);
  expect(panel.querySelector('ytd-watch-card-hero-video-renderer')?.getAttribute('data-yb-action')).toBe('blur');
  const children=panel.querySelectorAll('ytd-watch-card-compact-video-renderer');
  expect(children[0].getAttribute('data-yb-action')).toBe('blur');expect(children[1].hasAttribute('data-yb-action')).toBe(false);
 });
 it('reads a compact byline for author names and exact channel IDs',async()=>{
  win.__youblockSettings={filterData:{channelId:[['^UC-blocked$','','hide']]},options:{}};
  const node=document.createElement('ytd-watch-card-compact-video-renderer');
  (node as any).data={title:{simpleText:'A safe title'},byline:{runs:[{text:'Creator',navigationEndpoint:{browseEndpoint:{browseId:'UC-blocked'}}}]}};
  document.body.append(node);await turn();
  expect(metadata(node,window.location).values).toMatchObject({channelName:'Creator',channelId:'UC-blocked'});
  expect(node.getAttribute('data-yb-action')).toBe('hide');
 });
});


it('blocks navigation on blurred root anchors while allowing explicit reveal and restoring tabindex',async()=>{
 document.body.innerHTML='<a class="ytp-videowall-still" href="/watch?v=one" tabindex="0"><span class="ytp-videowall-still-info-title">Spoiler</span></a>';
 await turn();const node=document.querySelector('a')!;
 const click=new MouseEvent('click',{bubbles:true,cancelable:true});node.dispatchEvent(click);
 expect(click.defaultPrevented).toBe(true);expect(node.getAttribute('tabindex')).toBe('-1');
 const middle=new MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1});node.dispatchEvent(middle);expect(middle.defaultPrevented).toBe(true);
 node.querySelector('button')!.click();expect(node.hasAttribute('data-yb-action')).toBe(false);expect(node.getAttribute('tabindex')).toBe('0');
});

describe('three-second reveal',()=>{
 const clock=()=>{controller.dispose();vi.useFakeTimers();controller=installConcealment(win)};
 it('reveals matching copies for exactly three seconds and can repeat',async()=>{
  clock();document.body.innerHTML='<ytd-video-renderer><a href="/watch?v=one"><h3>Spoiler</h3></a></ytd-video-renderer><ytd-video-renderer><a href="/watch?v=one"><h3>Spoiler</h3></a></ytd-video-renderer>';
  await vi.advanceTimersByTimeAsync(0);
  const button=document.querySelector('button')!;
  expect(button.getAttribute('aria-label')).toBe('Reveal for 3 seconds');expect(button.textContent).toBe('');expect(button.querySelector('svg')).not.toBeNull();
  button.click();await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelectorAll('[data-yb-action]')).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(2999);expect(document.querySelectorAll('[data-yb-action]')).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1);expect(document.querySelectorAll('[data-yb-action="blur"]')).toHaveLength(2);
  expect(document.querySelector('a')?.hasAttribute('inert')).toBe(true);
  document.querySelector('button')!.click();await vi.advanceTimersByTimeAsync(3000);
  expect(document.querySelectorAll('[data-yb-action="blur"]')).toHaveLength(2);
 });
 it('uses current rules at expiry and does not reblur a removed match',async()=>{
  clock();document.body.innerHTML='<ytd-video-renderer aria-label="original"><a href="/watch?v=one"><h3>Spoiler</h3></a></ytd-video-renderer>';
  await vi.advanceTimersByTimeAsync(0);document.querySelector('button')!.click();
  win.__youblockSettings={filterData:{},options:{}};controller.rescan();
  await vi.advanceTimersByTimeAsync(3000);
  expect(document.querySelector('[data-yb-action]')).toBeNull();expect(document.querySelector('a')?.hasAttribute('inert')).toBe(false);expect(document.querySelector('ytd-video-renderer')?.getAttribute('aria-label')).toBe('original');
 });
 it('does not transfer a temporary reveal to a recycled video or override Hide',async()=>{
  clock();document.body.innerHTML='<ytd-video-renderer><a href="/watch?v=one"><h3>Spoiler</h3></a></ytd-video-renderer>';
  await vi.advanceTimersByTimeAsync(0);document.querySelector('button')!.click();
  document.querySelector('a')!.setAttribute('href','/watch?v=two');await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('ytd-video-renderer')?.getAttribute('data-yb-action')).toBe('blur');
  document.querySelector('button')!.click();win.__youblockSettings=settings('hide');controller.rescan();await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('ytd-video-renderer')?.getAttribute('data-yb-action')).toBe('hide');
 });
 it('cancels pending reveal timers when disposed',async()=>{
  clock();document.body.innerHTML='<ytd-video-renderer><a href="/watch?v=one"><h3>Spoiler</h3></a></ytd-video-renderer>';
  await vi.advanceTimersByTimeAsync(0);document.querySelector('button')!.click();controller.dispose();
  expect(vi.getTimerCount()).toBe(0);await vi.advanceTimersByTimeAsync(5000);
  expect(document.querySelector('[data-yb-action]')).toBeNull();expect(document.querySelector('#youblock-concealment-style')).toBeNull();
 });
});


it('fits pointer reveal motion inside three seconds and clears it on disposal',async()=>{
 controller.dispose();vi.useFakeTimers();controller=installConcealment(win);
 document.body.innerHTML='<ytd-video-renderer><a href="/watch?v=motion"><h3>Spoiler</h3></a></ytd-video-renderer>';
 await vi.advanceTimersByTimeAsync(0);const node=document.querySelector('ytd-video-renderer')!;
 node.querySelector('button')!.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
 expect(node.hasAttribute('data-yb-reveal-motion')).toBe(true);
 await vi.advanceTimersByTimeAsync(2799);expect(node.hasAttribute('data-yb-action')).toBe(false);
 await vi.advanceTimersByTimeAsync(1);expect(node.getAttribute('data-yb-action')).toBe('blur');
 expect(node.hasAttribute('data-yb-reveal-motion')).toBe(true);
 await vi.advanceTimersByTimeAsync(200);expect(node.hasAttribute('data-yb-reveal-motion')).toBe(false);
 node.querySelector('button')!.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
 controller.dispose();expect(node.hasAttribute('data-yb-reveal-motion')).toBe(false);expect(vi.getTimerCount()).toBe(0);
});


it('cancels reveal motion immediately when a video node is recycled',async()=>{
 controller.dispose();vi.useFakeTimers();controller=installConcealment(win);
 document.body.innerHTML='<ytd-video-renderer><a href="/watch?v=old"><h3>Spoiler</h3></a></ytd-video-renderer>';
 await vi.advanceTimersByTimeAsync(0);const node=document.querySelector('ytd-video-renderer')!;
 node.querySelector('button')!.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
 expect(node.querySelector('[data-yb-exiting] button')?.hasAttribute('disabled')).toBe(true);
 node.querySelector('a')!.setAttribute('href','/watch?v=new');await vi.advanceTimersByTimeAsync(0);
 expect(node.hasAttribute('data-yb-reveal-motion')).toBe(false);expect(node.getAttribute('data-yb-action')).toBe('blur');
 expect(node.querySelector('[data-yb-exiting]')).toBeNull();
});


it('keeps a keyboard reveal instant when it interrupts pointer reblur',async()=>{
 controller.dispose();vi.useFakeTimers();controller=installConcealment(win);
 document.body.innerHTML='<ytd-video-renderer><a href="/watch?v=repeat"><h3>Spoiler</h3></a></ytd-video-renderer>';
 await vi.advanceTimersByTimeAsync(0);const node=document.querySelector('ytd-video-renderer')!;
 node.querySelector('button')!.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
 await vi.advanceTimersByTimeAsync(2800);expect(node.hasAttribute('data-yb-reveal-motion')).toBe(true);
 node.querySelector('button:not([disabled])')!.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:0}));
 expect(node.hasAttribute('data-yb-reveal-motion')).toBe(false);
 await vi.advanceTimersByTimeAsync(2999);expect(node.hasAttribute('data-yb-action')).toBe(false);
 await vi.advanceTimersByTimeAsync(1);expect(node.getAttribute('data-yb-action')).toBe('blur');
});


it('reblurs immediately when a suspended page returns after the reveal deadline',async()=>{
 controller.dispose();vi.useFakeTimers();controller=installConcealment(win);
 document.body.innerHTML='<ytd-video-renderer><a href="/watch?v=late"><h3>Spoiler</h3></a></ytd-video-renderer>';
 await vi.advanceTimersByTimeAsync(0);const node=document.querySelector('ytd-video-renderer')!;
 node.querySelector('button')!.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
 vi.setSystemTime(Date.now()+4000);controller.rescan();await vi.advanceTimersByTimeAsync(0);
 expect(node.hasAttribute('data-yb-reveal-motion')).toBe(false);expect(node.getAttribute('data-yb-action')).toBe('blur');
});


it('shows the configured watch-page message in Hide mode and restores the page when disabled',async()=>{
 win.__youblockSettings={...settings('hide'),options:{block_message:'This video is filtered'}};
 document.body.innerHTML='<ytd-watch-flexy><div id="columns"><div id="primary"><h1>Spoiler</h1></div></div></ytd-watch-flexy>';
 await turn();expect(document.querySelector('[data-youblock-watch-notice]')?.textContent).toBe('This video is filtered');
 win.__youblockEnabled=false;controller.rescan();await turn();
 expect(document.querySelector('[data-youblock-watch-notice]')).toBeNull();expect(document.querySelector('#primary')?.hasAttribute('data-yb-action')).toBe(false);
});
