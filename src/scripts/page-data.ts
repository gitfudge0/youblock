import { decideAction } from '../core/matching';
import type { PageSettings, PageState } from './page-state';

type Action='hide'|'blur';
type RecordData=Record<string,any>;
type Metadata=Record<string,string>;
type PageWindow=Window & typeof globalThis & {__youblockPredicate?:(metadata:Metadata,kind:string,record:unknown)=>unknown};
const knownKinds=new WeakMap<object,string>();
const explicitKinds=new WeakMap<object,string>();
const isRendererKind=(kind:unknown):kind is string=>typeof kind==='string'&&/renderer$|viewmodel$|entitypayload$|^videoDetails$/i.test(kind);
function kindFor(record:object,requested:string):string {
 const explicit=explicitKinds.get(record);if(explicit)return explicit;
 if(requested!=='root')return requested;
 const known=knownKinds.get(record);if(known)return known;
 try{const serialized=(record as RecordData).__youblockKind;if(isRendererKind(serialized))return serialized}catch{}
 return 'root';
}
const read=(value:any,path:string):any=>path.split('.').reduce((result,key)=>result?.[key],value);
function label(value:any):string {
 if(typeof value==='string')return value;
 if(!value||typeof value!=='object')return '';
 if(typeof value.simpleText==='string')return value.simpleText;
 if(typeof value.content==='string')return value.content;
 if(Array.isArray(value.runs))return value.runs.map((run:any)=>typeof run?.text==='string'?run.text:'').join('');
 return '';
}
function firstText(...values:any[]):string {for(const value of values){const text=label(value);if(text)return text}return ''}
function metadata(record:RecordData,kind:string):Metadata {
 const header=record.header&&typeof record.header==='object'?Object.values(record.header).find((value:any)=>value&&typeof value==='object'&&value.title) as RecordData|undefined:undefined;
 const byline=record.byline||record.shortBylineText||record.longBylineText||record.ownerText;
 const author=record.author||{};
 const bylineEndpoint=Array.isArray(byline?.runs)?byline.runs.find((run:any)=>run?.navigationEndpoint?.browseEndpoint)?.navigationEndpoint?.browseEndpoint:undefined;
 const navigation=record.navigationEndpoint?.watchEndpoint||record.onTap?.innertubeCommand?.watchEndpoint||{};
 const result:Metadata={
  title:firstText(record.title,record.headline,record.videoTitle,header?.title),
  videoId:String(record.videoId||navigation.videoId||''),
  channelName:firstText(record.authorText,byline,author.displayName,record.channelName,record.channelTitle),
  channelId:String(record.channelId||record.externalChannelId||author.channelId||read(record,'authorEndpoint.browseEndpoint.browseId')||bylineEndpoint?.browseId||read(record,'navigationEndpoint.browseEndpoint.browseId')||read(header,'titleNavigationEndpoint.browseEndpoint.browseId')||''),
  comment:firstText(record.contentText,record.message,read(record,'properties.content'),record.commentText),
  duration:firstText(record.lengthText),
  percentWatched:'',
 };
 if((/channel/i.test(kind)&&!/video/i.test(kind))||(kind==='guideEntryRenderer'&&/^UC/.test(result.channelId))){result.channelName=result.channelName||result.title;result.title=''}
 if(!result.channelName&&header)result.channelName=label(header.title);
 if(!result.channelName&&record.heroImage)result.channelName=label(record.subtitle).split(' • ')[0];
 if(!result.comment&&record.properties?.content?.content)result.comment=label(record.properties.content.content);
 if(record.lengthSeconds!==undefined&&Number.isFinite(Number(record.lengthSeconds)))result.duration=String(Number(record.lengthSeconds));
 if(Array.isArray(record.thumbnailOverlays))for(const overlay of record.thumbnailOverlays){
  result.duration=result.duration||firstText(overlay?.thumbnailOverlayTimeStatusRenderer?.text);
  const percent=overlay?.thumbnailOverlayResumePlaybackRenderer?.percentDurationWatched;
  if(typeof percent==='number')result.percentWatched=String(percent);
 }
 return result;
}
function seconds(value:string):number|undefined {
 if(!value)return;
 if(/^\d+$/.test(value))return Number(value);
 if(/^\d+(?::\d{1,2})+$/.test(value))return value.split(':').reduce((total,part)=>total*60+Number(part),0);
}
function merge(first:Action|undefined,next:Action|undefined):Action|undefined {return first==='hide'||next==='hide'?'hide':first||next}
function actionFor(record:RecordData,kind:string,meta:Metadata,settings:PageSettings,win:PageWindow):Action|undefined {
 const isComment=/comment|livechat/i.test(kind);
 let action=decideAction(settings,meta,isComment);
 const fallback:Action=settings.options.youblock_mode==='blur'?'blur':'hide';
 if(settings.options.shorts&&/shorts|reel/i.test(kind))action=merge(action,fallback);
 if(settings.options.movies&&(/movie/i.test(kind)||(record.badges||[]).some?.((badge:any)=>/^movie$/i.test(label(badge?.metadataBadgeRenderer?.label)))))action=merge(action,fallback);
 const playlistId=record.playlistId||record.navigationEndpoint?.watchEndpoint?.playlistId;
 if(settings.options.mixes&&(/radio/i.test(kind)||(typeof playlistId==='string'&&playlistId.startsWith('RD'))))action=merge(action,fallback);
 const browseId=record.navigationEndpoint?.browseEndpoint?.browseId||record.endpoint?.browseEndpoint?.browseId;
 const url=record.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url||'';
 if(settings.options.trending&&(/^(FEtrending|FEexplore)$/.test(String(browseId))||/^\/feed\/(trending|explore)(?:[/?]|$)/.test(url)))action='hide';
 if(!isComment){
  const duration=seconds(meta.duration),range=settings.filterData.vidLength;
  if(duration!==undefined&&Array.isArray(range)&&range.length===2){
   const [min,max]=range;let outside=false,inside=false;
   if(min!==null&&Number.isFinite(Number(min)))outside||=duration<Number(min);
   if(max!==null&&Number.isFinite(Number(max)))outside||=duration>Number(max);
   if(min!==null&&max!==null)inside=duration>=Number(min)&&duration<=Number(max);
   if(settings.options.vidLength_type==='block'?inside:outside)action=merge(action,fallback);
  }
  const threshold=settings.options.percent_watched_hide,watched=Number(meta.percentWatched);
  if(threshold!==null&&threshold!==undefined&&meta.percentWatched&&Number.isFinite(watched)&&watched>=Number(threshold)&&!['/feed/history','/feed/library','/playlist'].includes(win.location.pathname))action=merge(action,fallback);
 }
 if(settings.options.enable_javascript&&typeof win.__youblockPredicate==='function'){
  try{
   const result=win.__youblockPredicate({...meta},kind,record);
   if(result===true)action=merge(action,fallback);
   else if(result==='hide'||result==='blur')action=merge(action,result);
  }catch(error){win.dispatchEvent(new win.CustomEvent('youblock-predicate-error',{detail:String(error)}))}
 }
 if(settings.options.suggestions_only&&kind==='videoDetails')return;
 return action;
}

/** Inspect each renderer's own fields. Child cards never lend their identity to a shelf. */
export function annotateData(root:unknown,state:PageState,win:PageWindow,rootKind:string='root'):void {
 const seen=new WeakSet<object>();let count=0;
 function visit(value:unknown,kind:string,depth:number):void {
  if(!value||typeof value!=='object'||depth>32||count++>=30000||seen.has(value))return;
  seen.add(value);
  if(Array.isArray(value)){for(const item of value)visit(item,kind,depth+1);return}
  const record=value as RecordData;
  kind=kindFor(record,kind);
  if(isRendererKind(kind))knownKinds.set(record,kind);
  let action:Action|undefined;
  const eligible=isRendererKind(kind)||kind==='root';
  try{
   if(isRendererKind(kind))record.__youblockKind=kind;
   if(eligible&&state.enabled&&state.settings&&!(win.location.pathname==='/feed/history'&&state.settings.options.disable_on_history)){
    const meta=metadata(record,kind);
    if(Object.values(meta).some(Boolean)||/shorts|reel|movie|radio/i.test(kind)||record.navigationEndpoint||record.endpoint||(kind!=='root'&&state.settings.options.enable_javascript))action=actionFor(record,kind,meta,state.settings,win);
   }
   if(action){record.__youblockAction=action;record.__youblockGeneration=state.generation}
   else {delete record.__youblockAction;delete record.__youblockGeneration}
  }catch{/* Read-only records and page-owned getters do not disable neighboring cards. */}
  let keys:string[];try{keys=Object.keys(record)}catch{return}
  for(const key of keys)if(!key.startsWith('__youblock'))try{visit(record[key],key,depth+1)}catch{/* Skip an unreadable property. */}

 }
 visit(root,rootKind,0);
}

/** Independent hooks: bounded startup, reversible annotations, native pass-through on failure. */
export function installDataHooks(win:Window & typeof globalThis,state:PageState){
 const page=win as PageWindow;
 let disposed=false;
 const roots=new Set<object>();
 const rootKinds=new WeakMap<object,string>();
 function refreshData(data:unknown,rootKind:string='root'){
  if(disposed||!data||typeof data!=='object')return;
  if(rootKind!=='root')explicitKinds.set(data,rootKind);
  const kind=kindFor(data,rootKind==='root'?(rootKinds.get(data)||'root'):rootKind);
  if(kind!=='root')rootKinds.set(data,kind);
  roots.add(data);if(roots.size>12)roots.delete(roots.values().next().value!);
  try{state.transformPlayerData?.(data)}catch{/* Player controls must not break response delivery. */}
  try{annotateData(data,state,page,kind)}catch{/* A hostile page getter must not interrupt response delivery. */}
 }
 const changed=()=>{for(const root of roots)refreshData(root)};
 win.addEventListener('youblock-settings',changed);
 const restorers:Array<()=>void>=[];
 for(const name of ['ytInitialData','ytInitialPlayerResponse']){
  const descriptor=Object.getOwnPropertyDescriptor(win,name);
  let stored=(win as any)[name];
  if(descriptor?.configurable===false){refreshData(stored);continue}
  try{
   Object.defineProperty(win,name,{configurable:true,enumerable:descriptor?.enumerable??true,get(){return descriptor?.get?descriptor.get.call(win):stored},set(value){stored=value;refreshData(value);descriptor?.set?.call(win,value)}});
   refreshData(stored);
   restorers.push(()=>{const current=(win as any)[name];if(descriptor){if('value'in descriptor)Object.defineProperty(win,name,{...descriptor,value:current});else Object.defineProperty(win,name,descriptor)}else{delete (win as any)[name];if(current!==undefined)(win as any)[name]=current}});
  }catch{/* A preexisting nonconfigurable page hook is left intact. */}
 }
 void state.ready.then(changed,()=>{});
 function apiURL(input:RequestInfo|URL):boolean {
  try{const url=new URL(typeof input==='string'?input:input instanceof win.URL?input.href:(input as Request).url,win.location.href);return url.origin===win.location.origin&&/^\/youtubei\/v1\//.test(url.pathname)}catch{return false}
 }
 const nativeFetch=win.fetch;
 if(typeof nativeFetch==='function'){
  const fetchHook:typeof fetch=async function(input,init){
   const response=await nativeFetch.call(win,input,init);
   if(disposed||!apiURL(input)||!response.ok)return response;
   await state.ready.catch(()=>{});
   if(disposed)return response;
   try{
    const data=await response.clone().json();refreshData(data);
    const headers=new win.Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
    const transformed=new win.Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
    for(const key of ['url','redirected','type'] as const)try{Object.defineProperty(transformed,key,{value:response[key],configurable:true})}catch{}
    return transformed;
   }catch{return response}
  };
  win.fetch=fetchHook;restorers.push(()=>{if(win.fetch===fetchHook)win.fetch=nativeFetch});
 }
 // XHR readers are synchronous: annotate available JSON without delaying native events.
 const xhrPrototype=win.XMLHttpRequest?.prototype;
 const nativeOpen=xhrPrototype?.open;
 const textGetter=xhrPrototype&&Object.getOwnPropertyDescriptor(xhrPrototype,'responseText')?.get;
 const responseGetter=xhrPrototype&&Object.getOwnPropertyDescriptor(xhrPrototype,'response')?.get;
 const xhrRestorers=new Map<XMLHttpRequest,()=>void>();
 if(nativeOpen&&textGetter&&responseGetter){
  const openHook=function(this:XMLHttpRequest,...args:any[]){
   xhrRestorers.get(this)?.();xhrRestorers.delete(this);
   const result=Reflect.apply(nativeOpen,this,args);
   if(!apiURL(String(args[1])))return result;
   const ownText=Object.getOwnPropertyDescriptor(this,'responseText'),ownResponse=Object.getOwnPropertyDescriptor(this,'response');
   let previous='',serialized='',previousGeneration=-1,previousEnabled=false;
   const rewrite=(raw:string)=>{
    if(disposed||this.readyState!==4||this.status<200||this.status>=300||!state.settings)return raw;
    if(raw===previous&&previousGeneration===state.generation&&previousEnabled===state.enabled)return serialized;
    try{const value=JSON.parse(raw);refreshData(value);previous=raw;previousGeneration=state.generation;previousEnabled=state.enabled;serialized=JSON.stringify(value);return serialized}catch{return raw}
   };
   try{
    Object.defineProperty(this,'responseText',{configurable:true,get:()=>rewrite(textGetter.call(this))});
    Object.defineProperty(this,'response',{configurable:true,get:()=>{
     const value=responseGetter.call(this);
     if(disposed||this.readyState!==4||this.status<200||this.status>=300)return value;
     if(this.responseType==='json'){refreshData(value);return value}
     return typeof value==='string'?rewrite(value):value;
    }});
    xhrRestorers.set(this,()=>{if(ownText)Object.defineProperty(this,'responseText',ownText);else delete (this as any).responseText;if(ownResponse)Object.defineProperty(this,'response',ownResponse);else delete (this as any).response});
    if(xhrRestorers.size>64){const first=xhrRestorers.keys().next().value!;xhrRestorers.get(first)!();xhrRestorers.delete(first)}
   }catch{/* Unsupported response descriptors retain native behavior. */}
   return result;
  };
  xhrPrototype.open=openHook as XMLHttpRequest['open'];
  restorers.push(()=>{if(xhrPrototype.open===openHook)xhrPrototype.open=nativeOpen;for(const restore of xhrRestorers.values())restore();xhrRestorers.clear()});
 }
 return {refreshData,dispose(){if(disposed)return;disposed=true;win.removeEventListener('youblock-settings',changed);for(const restore of restorers.reverse())restore();roots.clear()}};
}
