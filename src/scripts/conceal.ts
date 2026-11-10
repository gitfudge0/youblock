import { rendererKind } from "../core/renderer-kind";
import { decideAction } from "../core/matching";
export { decideAction } from "../core/matching";

/** YouBlock DOM fallback. Runs in MAIN world so Polymer renderer data is readable. */
type ConcealAction = 'hide' | 'blur';
type Compiled = {filterData: Record<string, unknown>; options: Record<string, unknown>};
type YBWindow = Window & typeof globalThis & {
  __youblockRefreshData?: (data:unknown,kind?:string)=>void; __youblockSettings?: Compiled; __youblockEnabled?: boolean; __youblockGeneration?: number;
  __youblockConcealment?: ReturnType<typeof installConcealment>;
};
export const cardSelector = [
  'ytd-rich-item-renderer','ytd-video-renderer','ytd-grid-video-renderer',
  'ytd-compact-video-renderer','ytd-playlist-video-renderer','ytd-playlist-panel-video-renderer',
  'ytd-reel-item-renderer','ytd-shorts-lockup-view-model','yt-lockup-view-model',
  'ytd-comment-thread-renderer','ytd-comment-view-model','ytd-comment-renderer',
  'yt-live-chat-text-message-renderer','ytd-movie-renderer','ytd-compact-movie-renderer',
  'ytd-radio-renderer','ytd-compact-radio-renderer','ytd-channel-renderer',
  'ytd-post-renderer','ytd-backstage-post-thread-renderer','ytd-guide-entry-renderer','ytd-mini-guide-entry-renderer',
  'ytd-reel-video-renderer','ytm-reel-video-renderer','.ytp-videowall-still','.ytp-ce-video',
  'ytm-compact-link-renderer','ytm-navigation-item-renderer',
  'ytd-watch-card-rich-header-renderer','ytm-watch-card-rich-header-renderer',
  'ytd-watch-card-hero-video-renderer','ytm-watch-card-hero-video-renderer',
  'ytm-video-with-context-renderer','ytm-compact-video-renderer','ytm-reel-item-renderer',
  'ytm-shorts-lockup-view-model','ytm-comment-thread-renderer','ytm-comment-renderer',
  'ytd-watch-flexy > #columns > #primary','ytd-watch-grid #main',
  'ytm-watch #player-container-id','ytm-slim-video-metadata-renderer',
  'ytm-media-item','ytm-compact-media-item-renderer','ytm-playlist-panel-video-renderer',
  'ytd-grid-playlist-renderer','ytm-grid-playlist-renderer','ytd-playlist-renderer','ytm-playlist-renderer','ytd-grid-channel-renderer','ytm-grid-channel-renderer','ytd-mini-channel-renderer','ytm-mini-channel-renderer','ytd-compact-channel-renderer','ytm-compact-channel-renderer','ytd-end-screen-playlist-renderer','ytm-end-screen-playlist-renderer','ytd-end-screen-video-renderer','ytm-end-screen-video-renderer','ytd-grid-radio-renderer','ytm-grid-radio-renderer','ytd-watch-card-compact-video-renderer','ytm-watch-card-compact-video-renderer','ytd-shelf-renderer','ytm-shelf-renderer','ytd-rich-shelf-renderer','ytm-rich-shelf-renderer','ytd-channel-video-player-renderer','ytm-channel-video-player-renderer','ytd-universal-watch-card-renderer','ytm-universal-watch-card-renderer','ytd-compact-channel-recommendation-card-renderer','ytm-compact-channel-recommendation-card-renderer','ytd-player-overlay-autoplay-renderer','ytm-player-overlay-autoplay-renderer','ytd-channel-featured-video-renderer','ytm-channel-featured-video-renderer','ytd-video-card-renderer','ytm-video-card-renderer','ytd-chip-cloud-chip-renderer','ytm-chip-cloud-chip-renderer','ytd-slim-video-metadata-section-renderer','ytm-slim-video-metadata-section-renderer','ytd-slim-video-metadata-renderer','ytm-slim-video-metadata-renderer','ytd-tab-renderer','ytm-tab-renderer','ytd-grid-shelf-view-model','ytm-grid-shelf-view-model','ytd-rich-section-renderer','ytm-rich-section-renderer','ytd-pivot-bar-item-renderer','ytm-pivot-bar-item-renderer','ytd-playlist-header-renderer','ytm-playlist-header-renderer','ytd-channel-metadata-renderer','ytm-channel-metadata-renderer','ytd-c4-tabbed-header-renderer','ytm-c4-tabbed-header-renderer','ytd-page-header-renderer','ytm-page-header-renderer',
].join(',');
// These hosts own collections. Child card matches must never conceal their whole shelf.
const containerHosts=new Set(['shelf-renderer','rich-shelf-renderer','rich-section-renderer','grid-shelf-view-model','universal-watch-card-renderer'].flatMap(name=>['ytd-'+name,'ytm-'+name]));
const channelHosts=new Set(['channel-renderer','grid-channel-renderer','mini-channel-renderer','compact-channel-renderer','compact-channel-recommendation-card-renderer','guide-entry-renderer','mini-guide-entry-renderer','channel-metadata-renderer','c4-tabbed-header-renderer','page-header-renderer'].flatMap(name=>['ytd-'+name,'ytm-'+name]));
const isComment = (node: Element) => /comment|live-chat/.test(node.localName);
const text = (value: any): string => typeof value === 'string' ? value : value?.simpleText || value?.content || value?.runs?.map((r:any)=>r.text||'').join('') || '';
const at = (obj: any, path: string): any => path.split('.').reduce((o,k)=>o?.[k],obj);
const first = (node: Element, selector: string) => node.querySelector(selector)?.textContent?.trim() || '';
const anonymousKeys=new WeakMap<HTMLElement,{source:unknown;key:string}>();
let anonymousSequence=0;
function anonymousKey(node:HTMLElement,source:unknown):string {
  let previous=anonymousKeys.get(node);
  if(!previous||previous.source!==source){previous={source,key:'anonymous:'+ ++anonymousSequence};anonymousKeys.set(node,previous)}
  return previous.key;
}
function secondsLabel(seconds:unknown):string {
  const value=Number(seconds);if(!Number.isFinite(value)||value<=0)return '';
  const minutes=Math.floor(value/60),remainder=Math.floor(value%60);
  return `${minutes}:${String(remainder).padStart(2,'0')}`;
}


interface Metadata {values: Record<string,string>; key:string; mark?:ConcealAction; markGeneration?:number}
export function metadata(node: HTMLElement, page: Pick<Location,'origin'|'href'|'pathname'>): Metadata {
  const values:Record<string,string>={};
  const container=containerHosts.has(node.localName),channelHost=channelHosts.has(node.localName);
  const watchPanel=/^(?:ytd|ytm)-universal-watch-card-renderer$/.test(node.localName);
  const watchCard=/^(?:ytd|ytm)-watch-card-/.test(node.localName);
  const data = (node as any).data || (node as any).dataRaw || (node as any).__data?.data;
  let mark:ConcealAction|undefined, markGeneration:number|undefined, markKey='';
  let visited=0;
  const seen=new WeakSet<object>();
  function inspect(obj:any,depth=0) {
    if (!obj || typeof obj!=='object' || depth>5 || ++visited>250 || seen.has(obj)) return;
    seen.add(obj);
    if (obj.__youblockAction==='hide'||obj.__youblockAction==='blur') {
      if(mark!=='hide')mark=obj.__youblockAction;
      markGeneration=obj.__youblockGeneration;
      markKey=obj.__youblockKey||markKey;
    }
    const assign=(key:string,value:any)=>{const v=text(value);if(v&&!values[key])values[key]=v};
    assign('videoId',obj.videoId || at(obj,'navigationEndpoint.watchEndpoint.videoId') || at(obj,'onTap.innertubeCommand.watchEndpoint.videoId'));
    assign('channelId', obj.channelId || obj.externalId || at(obj,'authorEndpoint.browseEndpoint.browseId') || at(obj,'navigationEndpoint.browseEndpoint.browseId'));
    assign('title',obj.title || obj.headline);
    assign('channelName',obj.byline || (channelHost?(obj.title||obj.displayName||obj.channelTitle||obj.formattedTitle):undefined)||obj.authorText || obj.ownerText || obj.shortBylineText || obj.longBylineText || at(obj,'author.displayName'));
    assign('channelId',at(obj,'byline.runs.0.navigationEndpoint.browseEndpoint.browseId'));
    assign('comment',obj.contentText || at(obj,'properties.content') || obj.message);
    assign('duration',obj.lengthText);
    if(Array.isArray(obj.thumbnailOverlays))for(const overlay of obj.thumbnailOverlays){assign('duration',overlay.thumbnailOverlayTimeStatusRenderer?.text);const percent=overlay.thumbnailOverlayResumePlaybackRenderer?.percentDurationWatched;if(percent!==undefined)values.percentWatched=String(percent)}
    // Avoid inspecting menu/recommendation data belonging to a different item.
    for(const [key,value] of Object.entries(obj)) {
      if(watchPanel)continue;
      if(container){const ownRenderer=node.localName.replace(/^(?:ytd|ytm)-/,'').replace(/-([a-z])/g,(_,letter:string)=>letter.toUpperCase());if(depth>0||key!==ownRenderer)continue}
      if ((/Renderer$|ViewModel$|^properties$|^author$|^metadata$/.test(key)||(!container&&key==='content')) && !/menu|related|recommend|shelf|playlistPanel/.test(key)) inspect(value,depth+1);
    }
  }
  inspect(data);
  if(watchPanel){
    // A collection's heading belongs to the panel; its videos have separate rules.
    const header=at(data,'header.watchCardRichHeaderRenderer');
    values.title=text(header?.title)||'';
    values.channelName=values.title;
    values.channelId=at(header,'titleNavigationEndpoint.browseEndpoint.browseId')||'';
    values.title=first(node,'ytd-watch-card-rich-header-renderer #title,ytm-watch-card-rich-header-renderer #title')||values.title;
  }
  const videoLink=container?null:node.matches('a[href]')?node as HTMLAnchorElement:node.querySelector<HTMLAnchorElement>('a[href*="watch?v="],a[href*="/shorts/"],a[href*="/live/"]');
  if(videoLink) {
    try {const url=new URL(videoLink.getAttribute('href')!,page.origin);values.videoId=url.searchParams.get('v')||url.pathname.match(/\/(?:shorts|live)\/([^/?]+)/)?.[1]||values.videoId||''}catch{}
  }
  const channel=container?null:node.querySelector<HTMLAnchorElement>('a[href*="/channel/"],#channel-name a,a.ytm-badge-and-byline-item-byline');
  if(channel){values.channelId=channel.getAttribute('href')?.match(/\/channel\/([^/?]+)/)?.[1]||values.channelId||'';values.channelName=channel.textContent?.trim()||values.channelName||''}
  // Prefer currently rendered values to stale Polymer data when a node is recycled.
  values.duration=(!container&&first(node,'ytd-thumbnail-overlay-time-status-renderer,.badge-shape-wiz__text,.yt-badge-shape__text'))||values.duration||'';
  values.title=(!container&&first(node,'#video-title,.yt-lockup-metadata-view-model__title,.media-item-headline,.ytp-videowall-still-info-title,.ytp-ce-video-title,.ytp-autonav-endscreen-upnext-title,h3,h1'))||values.title||'';
  if(watchCard){
    values.title=first(node,'#title,.title')||values.title;
    if(node.localName.includes('hero-video'))values.channelName=values.channelName||text(data?.subtitle).split(' • ')[0];
  }
  if(isComment(node)) {
    values.comment=first(node,'#content-text,.comment-text,.yt-core-attributed-string--white-space-pre-wrap,#message')||values.comment||'';
    values.channelName=first(node,'#author-text,.comment-title,#author-name')||values.channelName||'';
  }
  const watch=/\/watch$|\/shorts\//.test(page.pathname) && (node.id==='primary'||node.id==='main'||node.id==='player-container-id'||node.localName==='ytm-slim-video-metadata-renderer');
  if(watch){
    const currentId=new URL(page.href).searchParams.get('v')||page.pathname.split('/shorts/')[1]?.split('/')[0]||'';
    values.videoId=currentId;
    values.title=first(node,'h1,ytm-slim-video-information-renderer h2')||node.ownerDocument.title.replace(/ - YouTube$/,'')||values.title;
    values.channelName=first(node,'#owner #channel-name,.slim-owner-icon-and-title')||values.channelName;
    const view=node.ownerDocument.defaultView as any;
    const host=node.closest('ytd-watch-flexy,ytd-watch-grid,ytm-watch') as any;
    const hostData=host?.data||host?.dataRaw||host?.__data?.data;
    // SPA globals often describe the previous watch page. Only consume an exact current ID.
    const responses=[host?.playerData,hostData?.playerResponse,hostData?.playerData,view?.ytInitialPlayerResponse];
    const details=responses.map(response=>response?.videoDetails).find(detail=>detail?.videoId===currentId);
    if(details){
      inspect(details);
      values.title=String(details.title||values.title||'');
      values.channelId=String(details.channelId||values.channelId||'');
      values.channelName=String(details.author||values.channelName||'');
      values.duration=secondsLabel(details.lengthSeconds)||values.duration;
    }
    const hostId=hostData?.videoId||at(hostData,'currentVideoEndpoint.watchEndpoint.videoId')||at(hostData,'response.currentVideoEndpoint.watchEndpoint.videoId')||host?.playerData?.videoDetails?.videoId;
    if(hostId===currentId){
      const response=hostData?.response||hostData;
      const contents=at(response,'contents.twoColumnWatchNextResults.results.results.contents')||at(response,'contents.singleColumnWatchNextResults.results.results.contents')||[];
      if(Array.isArray(contents))for(const item of contents){
        inspect(item);
        const owner=item?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
        if(owner){values.channelId=String(at(owner,'navigationEndpoint.browseEndpoint.browseId')||values.channelId||'');values.channelName=text(owner.title)||values.channelName}
        const title=item?.videoPrimaryInfoRenderer?.title;if(title&&!details)values.title=text(title)||values.title;
      }
    }
  }
  if(channelHost){values.channelName=values.channelName||values.title;values.title=''}
  const identity=markKey||(channelHost?(values.channelId||values.channelName):'')||values.videoId||(isComment(node)?(values.comment?.trim()?values.channelName+'\n'+values.comment:''):(values.title?.trim()?values.channelId+'\n'+values.title:''));
  const key=(isComment(node)?'comment:':'video:')+(identity||anonymousKey(node,data));
  return {values,key,mark,markGeneration};
}


export function actionFor(node:HTMLElement,info:Metadata,settings:Compiled,pathname:string,generation?:number):ConcealAction|undefined {
  let action=containerHosts.has(node.localName)&&!node.localName.includes('universal-watch-card')?undefined:decideAction(settings,info.values,isComment(node));
        const generationMatches=info.markGeneration===undefined||info.markGeneration===generation;
        if(generationMatches&&info.mark==='hide')action='hide';else if(!action&&generationMatches)action=info.mark;
        const extendedAction:ConcealAction=settings.options.youblock_mode==='blur'&&action!=='hide'?'blur':'hide';
        if(settings.options.shorts&&/reel|shorts/.test(node.localName))action=extendedAction;
        if(settings.options.trending&&node.querySelector('a[href*="/feed/trending"],a[href*="/feed/explore"]'))action='hide';
        const duration=info.values.duration?.trim();
        if(duration&&/^\d+(?::\d{1,2})+$/.test(duration)){
          const seconds=duration.split(':').reduce((total,part)=>total*60+Number(part),0);
          const range=settings.filterData.vidLength;
          if(Array.isArray(range)&&range.length===2){const [min,max]=range;const match=settings.options.vidLength_type==='block'?(min!==null&&max!==null&&seconds>=Number(min)&&seconds<=Number(max)):((min!==null&&seconds<Number(min))||(max!==null&&seconds>Number(max)));if(match)action=settings.options.youblock_mode==='blur'&&action!=='hide'?'blur':'hide'}
        }
        const threshold=settings.options.percent_watched_hide;
        if(threshold!==null&&threshold!==undefined&&info.values.percentWatched&&Number(info.values.percentWatched)>=Number(threshold)&&!['/feed/history','/feed/library','/playlist'].includes(pathname))action=settings.options.youblock_mode==='blur'&&action!=='hide'?'blur':'hide';
        if(settings.options.movies&&/movie/.test(node.localName))action=extendedAction;
        if(settings.options.mixes&&/radio/.test(node.localName))action=extendedAction;
  const page=node.ownerDocument.defaultView as any;
  if(settings.options.enable_javascript&&typeof page?.__youblockPredicate==='function'){
    try{
      const result=page.__youblockPredicate({...info.values},rendererKind(node),(node as any).data);
      const custom=result===true?(settings.options.youblock_mode==='blur'?'blur':'hide'):result;
      if(custom==='hide')action='hide';else if(custom==='blur'&&action!=='hide')action='blur';
    }catch(error){page.dispatchEvent(new page.CustomEvent('youblock-predicate-error',{detail:String(error)}))}
  }
  return action;
}

/** Only navigate to known candidates whose required rule metadata is available. */
export function nextAllowedVideo(doc:Document,settings:Compiled,currentHref:string,generation?:number,excluded=new Set<string>(),refresh?:(data:unknown,kind?:string)=>void):string|undefined {
  const page=new URL(currentHref),currentId=page.searchParams.get('v')||page.pathname.split('/shorts/')[1]?.split('/')[0];
  const playlist=Array.from(doc.querySelectorAll<HTMLElement>('ytd-playlist-panel-video-renderer,ytm-playlist-panel-video-renderer'));
  const currentIndex=playlist.findIndex(node=>metadata(node,page).values.videoId===currentId);
  const candidates=currentIndex>=0?playlist.slice(currentIndex+1):Array.from(doc.querySelectorAll<HTMLElement>('#related ytd-compact-video-renderer,#related yt-lockup-view-model,ytm-watch-next-secondary-results-renderer ytm-video-with-context-renderer'));
  for(const node of candidates){
    try {
      const data=(node as any).data||(node as any).dataRaw||(node as any).__data?.data;
      if(data)refresh?.(data,rendererKind(node));
      const info=metadata(node,page),id=info.values.videoId;
      if(!id||id===currentId||excluded.has(id)||!info.values.title)continue;
      const incomplete=['channelId','channelName','title','videoId'].some(field=>Array.isArray(settings.filterData[field])&&(settings.filterData[field] as unknown[]).length&&!info.values[field]);
      if(incomplete||actionFor(node,info,settings,page.pathname,generation))continue;
      // A custom predicate is known only when refreshed renderer data was available.
      if(settings.options.enable_javascript&&settings.filterData.javascript&&!data)continue;
      const link=node.querySelector<HTMLAnchorElement>('a[href*="watch?v="],a[href*="/shorts/"]');
      if(!link)continue;const url=new URL(link.getAttribute('href')!,page.origin);
      if(url.origin!==page.origin||!['/watch'].includes(url.pathname))continue;
      return url.href;
    }catch{ /* Unknown or recycled data is not a safe autoplay target. */ }
  }
}

type SavedAttr = {element:HTMLElement; name:string; value:string|null};
interface RecordState {key:string;action:ConcealAction;overlay?:HTMLElement;notice?:HTMLElement;attrs:SavedAttr[];styles:{name:string;value:string;priority:string}[];media:Map<HTMLMediaElement,boolean>}
export function installConcealment(win: YBWindow) {
  const doc=win.document;
  const active=new Map<HTMLElement,RecordState>();
  const revealed=new Map<string,{until:number;timer:number}>();
  const revealMotion=new Map<HTMLElement,{key:string;until:number;timer:number}>();
  const motionDuration=200;
  const retiringOverlays=new Map<HTMLElement,number>();
  function clearMotion(node:HTMLElement){
    const motion=revealMotion.get(node);if(motion)win.clearTimeout(motion.timer);
    revealMotion.delete(node);node.removeAttribute('data-yb-reveal-motion');
    if(motion)for(const child of node.children){
      const property=child.hasAttribute('data-yb-cover')?'opacity':'filter';
      for(const animation of child.getAnimations?.()||[]){
        if('transitionProperty' in animation&&animation.transitionProperty===property)animation.cancel();
      }
    }
    for(const [overlay,timer] of retiringOverlays)if(overlay.parentElement===node){win.clearTimeout(timer);overlay.remove();retiringOverlays.delete(overlay)}
  }
  function startMotion(node:HTMLElement,key:string){
    const previous=revealMotion.get(node);
    if(previous)win.clearTimeout(previous.timer);
    node.setAttribute('data-yb-reveal-motion','');
    revealMotion.set(node,{key,until:Date.now()+3000,timer:win.setTimeout(()=>clearMotion(node),3000)});
    // Establish the existing blurred style before the user-requested state change.
    for(const child of node.children)if(!child.hasAttribute('data-yb-cover'))win.getComputedStyle(child).filter;
  }
  const navigationAttempted=new Set<string>();
  const skipped=new Set<string>();
  try{for(const id of JSON.parse(win.sessionStorage.getItem('youblock-skipped')||'[]'))if(typeof id==='string')skipped.add(id)}catch{}
  const pending=new Set<HTMLElement>();
  let disposed=false,scheduled=false,settingsArrived=!!win.__youblockSettings;
  const style=doc.createElement('style');
  style.id='youblock-concealment-style';
  style.textContent=`${cardSelector.split(',').map(s=>`${s}:not([data-yb-processed])`).join(',')}{visibility:hidden!important}
[data-yb-action="blur"],[data-yb-reveal-motion]{position:relative!important;isolation:isolate!important;overflow:hidden!important;min-height:56px!important;border-radius:16px!important}
[data-yb-action="blur"] > :not([data-yb-cover]){filter:blur(48px)!important;pointer-events:none!important;user-select:none!important}
[data-yb-action="blur"].ytp-videowall-still > [data-yb-cover],[data-yb-action="blur"].ytp-ce-video > [data-yb-cover],[data-yb-reveal-motion].ytp-videowall-still > [data-yb-cover][data-yb-exiting],[data-yb-reveal-motion].ytp-ce-video > [data-yb-cover][data-yb-exiting]{backdrop-filter:blur(48px)!important}
[data-yb-reveal-motion] > :not([data-yb-cover]){transition:filter ${motionDuration}ms cubic-bezier(0.23,1,0.32,1)!important}
[data-yb-reveal-motion] > [data-yb-cover]{opacity:1;transition:opacity ${motionDuration}ms cubic-bezier(0.23,1,0.32,1)!important}
@starting-style{[data-yb-reveal-motion] > [data-yb-cover]{opacity:0}}
[data-yb-cover][data-yb-exiting]{opacity:0!important;pointer-events:none!important}
[data-yb-cover][data-yb-exiting] button{pointer-events:none!important}
@media(prefers-reduced-motion:reduce){[data-yb-reveal-motion] > :not([data-yb-cover]),[data-yb-reveal-motion] > [data-yb-cover]{transition:none!important}}
[data-yb-action="hide"]{display:none!important}
[data-yb-cover]{visibility:visible!important;position:absolute!important;inset:0!important;z-index:2147483647!important;display:flex!important;justify-content:flex-end!important;align-items:flex-start!important;padding:6px!important;background:transparent!important;color:#f4f4f4!important;border-radius:inherit!important;box-sizing:border-box!important;pointer-events:none!important;font:500 12px/1.4 system-ui,sans-serif!important}
[data-yb-cover] > span{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important}
[data-yb-cover] button{all:initial;display:grid!important;place-items:center!important;cursor:pointer!important;pointer-events:auto!important;box-sizing:border-box!important;width:44px!important;height:44px!important;border:1px solid #555!important;border-radius:10px!important;padding:0!important;color:#f4f4f4!important;background:#111e!important;font:600 12px/1.4 system-ui,sans-serif!important}
[data-yb-cover] button:focus-visible{outline:2px solid #d8faac!important;outline-offset:3px!important}`;
  function mountStyle(){if(!style.isConnected)(doc.head||doc.documentElement)?.append(style)}
  mountStyle();
  const remember=(state:RecordState,element:HTMLElement,name:string,value:string|null)=>{
    if(!state.attrs.some(a=>a.element===element&&a.name===name))state.attrs.push({element,name,value:element.getAttribute(name)});
    if(value===null)element.removeAttribute(name);else element.setAttribute(name,value);
  };
  function restore(node:HTMLElement){const state=active.get(node);if(!state)return;state.notice?.remove();
    if(state.overlay&&revealMotion.has(node)&&!disposed){
      const overlay=state.overlay;overlay.setAttribute('data-yb-exiting','');overlay.setAttribute('aria-hidden','true');
      const button=overlay.querySelector('button');if(button)button.disabled=true;
      retiringOverlays.set(overlay,win.setTimeout(()=>{overlay.remove();retiringOverlays.delete(overlay)},motionDuration));
    }else state.overlay?.remove();for(const a of state.attrs){if(a.value===null)a.element.removeAttribute(a.name);else a.element.setAttribute(a.name,a.value)}for(const s of state.styles){if(s.value)node.style.setProperty(s.name,s.value,s.priority);else node.style.removeProperty(s.name)}for(const [media,muted] of state.media){try{media.muted=muted}catch{}}node.removeAttribute('data-yb-action');active.delete(node)}
  function silence(node:HTMLElement,state:RecordState){
    node.querySelectorAll<HTMLMediaElement>('video,audio').forEach(media=>{if(!state.media.has(media))state.media.set(media,media.muted);try{media.muted=true;media.pause()}catch{}});
  }
  function apply(node:HTMLElement,key:string,action:ConcealAction){
    let state=active.get(node);
    if(state&&(state.key!==key||state.action!==action)){restore(node);state=undefined}
    if(!state){
      state={key,action,attrs:[],styles:[],media:new Map()};active.set(node,state);
      remember(state,node,'aria-label',null);remember(state,node,'title',null);
      if(action==='hide'){remember(state,node,'aria-hidden','true');remember(state,node,'inert','')}
      node.setAttribute('data-yb-action',action);
      const watch=['primary','main','player-container-id'].includes(node.id)||node.localName==='ytm-slim-video-metadata-renderer';
      const configured=win.__youblockSettings?.options.block_message;
      const playbackMessage=typeof configured==='string'&&configured.trim()?configured:'Filtered by YouBlock';
      if(action==='hide'&&watch){
        const notice=doc.createElement('div');notice.setAttribute('data-youblock-watch-notice','');notice.setAttribute('role','status');notice.textContent=playbackMessage;
        notice.style.cssText='padding:20px;margin:12px 0;border:1px solid #5555;border-radius:16px;font:14px/1.5 system-ui;overflow-wrap:anywhere';
        node.after(notice);state.notice=notice;
      }
      if(action==='blur'){
        remember(state,node,'tabindex','-1');
        const cover=doc.createElement('div');cover.setAttribute('data-yb-cover','');cover.setAttribute('role','group');cover.setAttribute('aria-label',watch?playbackMessage:'Content filtered by YouBlock');
        const label=doc.createElement('span');label.textContent=isComment(node)?'Comment strongly blurred':'Content strongly blurred';
        const button=doc.createElement('button');button.type='button';
        button.setAttribute('aria-label','Reveal for 3 seconds');button.title='Reveal for 3 seconds';
        const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
        for(const [name,value] of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(name,value);
        const eye=doc.createElementNS(svg.namespaceURI,'path');eye.setAttribute('d','M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z');
        const pupil=doc.createElementNS(svg.namespaceURI,'circle');pupil.setAttribute('cx','12');pupil.setAttribute('cy','12');pupil.setAttribute('r','3');
        svg.append(eye,pupil);button.append(svg);
        button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();
          const previous=revealed.get(key);if(previous)win.clearTimeout(previous.timer);
          const animate=event.detail>0&&!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          // Both transitions fit inside the existing three-second reveal budget.
          const hold=3000-(animate?motionDuration:0);
          const until=Date.now()+hold;
          const timer=win.setTimeout(()=>{revealed.delete(key);rescan()},hold);
          revealed.set(key,{until,timer});
          for(const [other,current] of active)if(current.key===key){if(animate)startMotion(other,key);else clearMotion(other);restore(other);}
          node.setAttribute('data-yb-processed','');
          rescan();
        });
        cover.append(label,button);state.overlay=cover;node.append(cover);
      }
    }
    if(action==='blur')for(const child of node.children){if(child!==state.overlay&&child instanceof win.HTMLElement){remember(state,child,'aria-hidden','true');remember(state,child,'inert','')}}
    silence(node,state);
  }
  function evaluate(node:HTMLElement){
    if(!node.isConnected){clearMotion(node);restore(node);return}
    const retained=(node as any).data||(node as any).dataRaw||(node as any).__data?.data;
    if(retained)win.__youblockRefreshData?.(retained,rendererKind(node));
    const info=metadata(node,win.location),settings=win.__youblockSettings;
    const motion=revealMotion.get(node);
    if(motion&&(motion.key!==info.key||motion.until<=Date.now()))clearMotion(node);
    const outer=node.parentElement?.closest<HTMLElement>(cardSelector);
    if(outer&&(outer.hasAttribute('data-yb-action')||(!containerHosts.has(outer.localName)&&!isComment(node)&&!['primary','main','player-container-id'].includes(outer.id)))){restore(node);node.setAttribute('data-yb-processed','');return}
    let action:ConcealAction|undefined;
    if(!settings&&!settingsArrived&&win.__youblockEnabled!==false)return;
    if(win.__youblockEnabled!==false&&settings){
      const disabledHistory=win.location.pathname==='/feed/history'&&settings.options.disable_on_history;
      if(!disabledHistory){
        action=actionFor(node,info,settings,win.location.pathname,win.__youblockGeneration);
        if(settings.options.suggestions_only&&(node.id==='primary'||node.id==='main'||node.id==='player-container-id'||node.localName==='ytm-slim-video-metadata-renderer'))action=undefined;
      }
    }
    if(action==='blur'){
      let host:HTMLElement|null=node;
      while(host){
        const key=host===node?info.key:metadata(host,win.location).key;
        if((revealed.get(key)?.until||0)>Date.now()){action=undefined;break}
        host=host.parentElement?.closest<HTMLElement>(cardSelector)||null;
      }
    }
    const previous=active.get(node);
    const changed=previous?previous.action!==action||previous.key!==info.key:Boolean(action);
    if(action==='hide')clearMotion(node);
    if(action)apply(node,info.key,action);else restore(node);
    if(changed)node.querySelectorAll<HTMLElement>(cardSelector).forEach(queue);
    const watchHost=['primary','main','player-container-id'].includes(node.id)||node.localName==='ytm-slim-video-metadata-renderer';
    if(action==='hide'&&watchHost&&settings?.options.autoplay&&!settings.options.suggestions_only&&!navigationAttempted.has(win.location.href)){
      const currentId=info.values.videoId;if(currentId)skipped.add(currentId);
      const next=nextAllowedVideo(doc,settings,win.location.href,win.__youblockGeneration,skipped,win.__youblockRefreshData);
      if(next){navigationAttempted.add(win.location.href);try{win.sessionStorage.setItem('youblock-skipped',JSON.stringify(Array.from(skipped).slice(-100)))}catch{}win.location.assign(next)}
    }
    node.setAttribute('data-yb-processed','');
  }
  function flush(){scheduled=false;if(disposed)return;mountStyle();for(const node of pending){try{evaluate(node)}catch{restore(node);node.setAttribute('data-yb-processed','')}}pending.clear();for(const node of active.keys())if(!node.isConnected)restore(node)}
  function queue(node:HTMLElement){pending.add(node);if(!scheduled){scheduled=true;queueMicrotask(flush)}}
  function queueLineage(element:HTMLElement){
    const hosts:HTMLElement[]=[];let host:HTMLElement|null=element.closest<HTMLElement>(cardSelector);
    while(host){hosts.push(host);host=host.parentElement?.closest<HTMLElement>(cardSelector)||null}
    hosts.reverse().forEach(queue);
  }
  function scan(root:ParentNode){
    if(root instanceof win.HTMLElement){if(root.hasAttribute('data-yb-cover')||root.closest('[data-yb-cover]'))return;queueLineage(root)}
    root.querySelectorAll<HTMLElement>(cardSelector).forEach(queue);
  }
  const observer=new win.MutationObserver(records=>{
    for(const record of records){
      if(record.type==='childList'){if(record.removedNodes.length)for(const node of active.keys())if(!node.isConnected)queue(node);for(const node of record.addedNodes)if(node instanceof win.HTMLElement)scan(node);if(record.target instanceof win.HTMLElement&&!record.target.closest('[data-yb-cover]')){queueLineage(record.target)}}
      else {const element=record.target instanceof win.HTMLElement?record.target:record.target.parentElement;if(element&&!element.closest('[data-yb-cover]'))queueLineage(element)}
    }
  });
  observer.observe(doc,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','video-id','title']});
  function rescan(){if(disposed)return;settingsArrived=true;mountStyle();scan(doc);for(const node of active.keys())queue(node)}
  function onPlay(event:Event){const media=event.target;if(!(media instanceof win.HTMLMediaElement))return;const host=media.closest<HTMLElement>('[data-yb-action]');if(host){const state=active.get(host);if(state)silence(host,state)}}
  function onClick(event:Event){
    const target=event.target instanceof win.Element?event.target:null;
    if(target?.closest('[data-yb-action="blur"]')&&!target.closest('[data-yb-cover] button')){
      event.preventDefault();event.stopImmediatePropagation();
    }
  }
  doc.addEventListener('click',onClick,true);
  doc.addEventListener('auxclick',onClick,true);
  doc.addEventListener('visibilitychange',rescan);
  doc.addEventListener('play',onPlay,true);
  win.addEventListener('youblock-settings',rescan);
  doc.addEventListener('yt-navigate-finish',rescan);
  // Fail open if the extension bridge does not initialize; never hide the whole page indefinitely.
  const timeout=win.setTimeout(()=>{if(!settingsArrived){settingsArrived=true;style.remove();scan(doc)}},2500);
  scan(doc);
  return {rescan,dispose(){disposed=true;win.clearTimeout(timeout);for(const reveal of revealed.values())win.clearTimeout(reveal.timer);revealed.clear();for(const node of revealMotion.keys())clearMotion(node);for(const [overlay,timer] of retiringOverlays){win.clearTimeout(timer);overlay.remove()}retiringOverlays.clear();observer.disconnect();doc.removeEventListener('visibilitychange',rescan);doc.removeEventListener('click',onClick,true);doc.removeEventListener('auxclick',onClick,true);doc.removeEventListener('play',onPlay,true);win.removeEventListener('youblock-settings',rescan);doc.removeEventListener('yt-navigate-finish',rescan);for(const node of active.keys())restore(node);style.remove();doc.querySelectorAll('[data-yb-processed]').forEach(n=>n.removeAttribute('data-yb-processed'))}};
}
if(typeof window!=='undefined'){
  const win=window as YBWindow;
  win.__youblockConcealment ||= installConcealment(win);
}
