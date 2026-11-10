import type {PageState} from './page-state';

/** Independently authored YouBlock actions. Native YouTube menu objects are never modified. */
const cards=[
 'ytd-video-renderer','ytd-rich-grid-media','ytd-rich-item-renderer','ytd-grid-video-renderer',
 'ytd-compact-video-renderer','ytd-playlist-video-renderer','ytd-playlist-panel-video-renderer',
 'ytd-watch-card-compact-video-renderer','ytd-watch-card-hero-video-renderer',
 'yt-lockup-view-model','ytd-shorts-lockup-view-model','ytd-reel-item-renderer',
 'ytm-video-with-context-renderer','ytm-compact-video-renderer','ytm-media-item',
 'ytm-playlist-panel-video-renderer','ytm-reel-item-renderer','ytm-shorts-lockup-view-model',
 'ytd-channel-renderer','ytd-grid-channel-renderer','ytm-channel-renderer','ytm-compact-channel-renderer',
 '.ytp-videowall-still','.ytp-ce-video',
].join(',');
type Entry={videoId:string;channelId:string;title:string;channelName:string;data:any};
const get=(value:any,path:string):any=>path.split('.').reduce((v,key)=>v?.[key],value);
const label=(value:any):string=>typeof value==='string'?value:value?.simpleText||value?.content||value?.runs?.map((run:any)=>run.text||'').join('')||'';
function ownData(host:HTMLElement):any {
 const nested=host.querySelector<HTMLElement>('ytd-rich-grid-media,ytm-video-with-context-renderer,yt-lockup-view-model');
 let data=(host as any).data||(host as any).dataRaw||(host as any).__data?.data||(nested as any)?.data;
 const wrappers=['content','videoRenderer','videoWithContextRenderer','lockupViewModel','compactVideoRenderer','richItemRenderer'];
 for(let depth=0;depth<5&&data&&typeof data==='object';depth++){
  if(data.videoId||data.title||data.headline||data.channelId||data.menu)break;
  const key=wrappers.find(name=>data[name]&&typeof data[name]==='object');if(!key)break;data=data[key];
 }
 return data;
}
function identity(host:HTMLElement,origin:string):Entry {
 const data=ownData(host);
 let videoId=String(data?.videoId||get(data,'navigationEndpoint.watchEndpoint.videoId')||get(data,'onTap.innertubeCommand.watchEndpoint.videoId')||'');
 let channelId=String(data?.channelId||data?.externalId||get(data,'navigationEndpoint.browseEndpoint.browseId')||get(data,'ownerEndpoint.browseEndpoint.browseId')||get(data,'shortBylineText.runs.0.navigationEndpoint.browseEndpoint.browseId')||get(data,'longBylineText.runs.0.navigationEndpoint.browseEndpoint.browseId')||get(data,'byline.runs.0.navigationEndpoint.browseEndpoint.browseId')||'');
 const video=host.matches('a[href]')?host:host.querySelector('a[href*="watch?v="],a[href*="/shorts/"],a[href*="/live/"]');
 if(video){try{const url=new URL(video.getAttribute('href')||'',origin);if(url.origin===origin)videoId=url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|live)\/([^/?]+)/)?.[1]||videoId}catch{}}
 const channel=host.querySelector('a[href*="/channel/"],#channel-name a,a.ytm-badge-and-byline-item-byline');
 if(channel){try{const url=new URL(channel.getAttribute('href')||'',origin);if(url.origin===origin)channelId=url.pathname.match(/^\/channel\/([^/?]+)/)?.[1]||channelId}catch{}}
 const title=host.querySelector('#video-title,.yt-lockup-metadata-view-model__title,.media-item-headline,.title,h3')?.textContent?.trim()||label(data?.title||data?.headline)||'this video';
 const channelName=channel?.textContent?.trim()||label(data?.shortBylineText||data?.longBylineText||data?.byline||data?.ownerText)||'this channel';
 return {videoId,channelId,title,channelName,data};
}
function notInterested(data:any):unknown {
 const menu=data?.menu;if(!menu||typeof menu!=='object')return;
 const seen=new WeakSet<object>();let count=0;
 function visit(value:any,depth:number):unknown {
  if(!value||typeof value!=='object'||depth>8||++count>300||seen.has(value))return;
  seen.add(value);
  const text=label(value.text||value.title).trim();
  if(value.icon?.iconType==='NOT_INTERESTED'||/^not interested$/i.test(text)){
   const endpoint=value.serviceEndpoint||value.onTap?.innertubeCommand;
   if(endpoint?.feedbackEndpoint)return endpoint;
  }
  for(const child of Object.values(value)){if(child&&typeof child==='object'){const found=visit(child,depth+1);if(found)return found}}
 }
 return visit(menu,0);
}

export function installQuickMenu(win:Window & typeof globalThis,state:PageState):{dispose():void} {
 const doc=win.document;
 let menu:HTMLElement|undefined,returnFocus:HTMLElement|undefined,disposed=false,queued=false;
 const affordances=new Set<HTMLButtonElement>();
 const pending=new Map<string,{host:HTMLElement;entry:Entry;endpoint:unknown;expires:number;timer:number}>();
 const style=doc.createElement('style');style.setAttribute('data-youblock-quick-style','');
 style.textContent=`[data-youblock-action-trigger]{display:inline-grid;place-items:center;width:36px;height:36px;padding:0;border:1px solid #6666;border-radius:9px;background:transparent;color:inherit;cursor:pointer;vertical-align:middle;margin:0 4px;touch-action:manipulation}[data-youblock-action-trigger]:focus-visible{outline:2px solid #c3f066;outline-offset:2px}[data-youblock-quick-menu]{position:fixed;z-index:2147483647;box-sizing:border-box;width:236px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow-y:auto;padding:6px;border:1px solid #3b3b3b;border-radius:12px;background:#121212;color:#f4f4f4;box-shadow:0 12px 40px #0006;font:13px/1.5 system-ui,sans-serif}[data-youblock-quick-menu] button{display:block;box-sizing:border-box;width:100%;min-height:44px;padding:10px 12px;border:0;border-radius:7px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}[data-youblock-quick-menu] button:focus-visible{outline:2px solid #c3f066;outline-offset:-2px;background:#242424}[data-youblock-quick-menu] button:disabled{opacity:.45;cursor:default}[data-youblock-quick-menu] p{padding:7px 12px;margin:0;color:#aaa;font-size:11px}@media(hover:hover) and (pointer:fine){[data-youblock-quick-menu] button:not(:disabled):hover{background:#242424}}`;
 function mount(){if(!style.isConnected)(doc.head||doc.documentElement)?.append(style)}
 mount();
 function dismiss(restoreFocus=false){menu?.remove();menu=undefined;if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus();returnFocus=undefined}
 function request(host:HTMLElement,entry:Entry,type:'videoId'|'channelId'){
  const id=entry[type];if(!id||!state.enabled)return;
  const requestId=win.crypto.randomUUID();
  const endpoint=state.settings?.options.block_feedback?notInterested(entry.data):undefined;
  const timer=win.setTimeout(()=>pending.delete(requestId),30000);
  pending.set(requestId,{host,entry,endpoint,expires:Date.now()+30000,timer});
  win.postMessage({from:'YOUBLOCK_PAGE',type:'contextBlockData',data:{type,info:{id,text:type==='videoId'?entry.title:entry.channelName},requestId}},win.location.origin);
 }
 function open(host:HTMLElement,x:number,y:number,trigger?:HTMLElement){
  if(!state.enabled)return;
  dismiss();mount();const entry=identity(host,win.location.origin);
  returnFocus=trigger||doc.activeElement as HTMLElement;
  menu=doc.createElement('div');menu.setAttribute('data-youblock-quick-menu','');menu.setAttribute('role','menu');menu.setAttribute('aria-label','YouBlock actions');
  for(const [type,text] of [['videoId','Block this video'],['channelId','Block this channel']] as const){
   const button=doc.createElement('button');button.type='button';button.textContent=text;button.setAttribute('role','menuitem');button.disabled=!entry[type];
   if(button.disabled)button.title='This item does not expose an exact ID';
   button.addEventListener('click',()=>{request(host,entry,type);dismiss(true)});menu.append(button);
  }
  if(!entry.videoId||!entry.channelId){const help=doc.createElement('p');help.textContent='Unavailable actions need an exact video or channel ID.';menu.append(help)}
  menu.style.left=`${Math.max(8,Math.min(x,win.innerWidth-244))}px`;
  (doc.body||doc.documentElement)?.append(menu);
  const height=menu.getBoundingClientRect().height;menu.style.top=`${Math.max(8,Math.min(y,win.innerHeight-height-8))}px`;
  menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
 }
 function hostFor(target:Element):HTMLElement|null{return target.closest<HTMLElement>(cards)||target.closest<HTMLElement>('a[href*="watch?v="],a[href*="/shorts/"],a[href*="/live/"]')}
 function contextMenu(event:MouseEvent){
  const target=event.target instanceof win.Element?event.target:null;if(!target||target.closest('[data-youblock-quick-menu]')||!state.enabled)return;
  const host=hostFor(target);if(!host||host.closest('[data-yb-action], [inert]'))return;
  const entry=identity(host,win.location.origin);if(!entry.videoId&&!entry.channelId)return;
  event.preventDefault();event.stopPropagation();open(host,event.clientX,event.clientY);
 }
 function keyboard(event:KeyboardEvent){
  if(!menu)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss(true);return}
  if(event.key==='Tab'){dismiss();return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));if(!buttons.length)return;
  const index=buttons.indexOf(doc.activeElement as HTMLButtonElement);
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(index+1)%buttons.length:(index-1+buttons.length)%buttons.length;buttons[next].focus();
 }
 function outside(event:Event){if(menu&&event.target instanceof win.Node&&!menu.contains(event.target))dismiss()}
 function confirmation(event:MessageEvent){
  if(disposed||event.source!==win||event.origin!==win.location.origin||event.data?.from!=='YOUBLOCK_CONTENT'||event.data.type!=='contextBlockConfirmed')return;
  const requestId=event.data.data?.requestId;if(typeof requestId!=='string')return;
  const request=pending.get(requestId);if(!request)return;pending.delete(requestId);win.clearTimeout(request.timer);
  if(!state.enabled||!state.settings?.options.block_feedback||Date.now()>request.expires||!request.endpoint||!request.host.isConnected)return;
  const current=identity(request.host,win.location.origin);
  if(current.videoId!==request.entry.videoId||current.channelId!==request.entry.channelId)return;
  // Ask YouTube's existing service handler to execute the original optional feedback endpoint.
  request.host.dispatchEvent(new win.CustomEvent('yt-service-request',{bubbles:true,composed:true,detail:{endpoint:request.endpoint}}));
 }
 function addAffordance(host:HTMLElement){
  if(host.querySelector(cards)||host.querySelector('[data-youblock-action-trigger]'))return;
  const native=host.querySelector<HTMLElement>('ytd-menu-renderer,ytm-menu-renderer,.yt-lockup-metadata-view-model__menu-button,button[aria-label="More actions"],button[aria-label="More options"]');
  if(!native||!native.parentElement)return;
  const button=doc.createElement('button');button.type='button';button.setAttribute('data-youblock-action-trigger','');button.setAttribute('aria-label','YouBlock actions');button.title='Filter with YouBlock';button.hidden=!state.enabled;
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'18',height:'18',fill:'none',stroke:'currentColor','stroke-width':'1.8','aria-hidden':'true'}))svg.setAttribute(key,value);
  const path=doc.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M4 6h16M7 12h10M10 18h4');svg.append(path);button.append(svg);
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const box=button.getBoundingClientRect();open(host,box.left,box.bottom+5,button)});
  native.insertAdjacentElement('afterend',button);affordances.add(button);
 }
 function scan(){queued=false;if(disposed)return;mount();for(const node of affordances){if(!node.isConnected)affordances.delete(node);else node.hidden=!state.enabled}doc.querySelectorAll<HTMLElement>(cards).forEach(addAffordance)}
 function schedule(){if(!queued&&!disposed){queued=true;queueMicrotask(scan)}}
 const observer=new win.MutationObserver(records=>{if(records.some(record=>!(record.target instanceof win.Element)||!record.target.closest('[data-youblock-quick-menu]')))schedule()});
 observer.observe(doc,{childList:true,subtree:true});
 function changed(){if(!state.enabled)dismiss();schedule()}
 doc.addEventListener('contextmenu',contextMenu);doc.addEventListener('keydown',keyboard,true);doc.addEventListener('pointerdown',outside,true);doc.addEventListener('yt-navigate-finish',changed);win.addEventListener('message',confirmation);win.addEventListener('youblock-settings',changed);scan();
 return {dispose(){disposed=true;observer.disconnect();dismiss();for(const button of affordances)button.remove();affordances.clear();for(const request of pending.values())win.clearTimeout(request.timer);pending.clear();style.remove();doc.removeEventListener('contextmenu',contextMenu);doc.removeEventListener('keydown',keyboard,true);doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('yt-navigate-finish',changed);win.removeEventListener('message',confirmation);win.removeEventListener('youblock-settings',changed)}};
}
