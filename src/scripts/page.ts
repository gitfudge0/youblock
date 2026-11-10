/** YouBlock's original MAIN-world runtime. No remote code or runtime dependencies. */
import {installDataHooks} from './page-data';
import {installQuickMenu} from './quick-menu';
import {installPlayerControls} from './player-controls';
import type {PageState,PageSettings} from './page-state';

type PageWindow=Window & typeof globalThis & {
  __youblockSettings?:PageSettings;
  __youblockEnabled?:boolean;
  __youblockGeneration?:number;
  __youblockRefreshData?:(root:unknown,kind?:string)=>void;
  __youblockPredicate?:((metadata:Record<string,string>,kind:string,record:unknown)=>unknown);
  __youblockRuntime?:{dispose():void};
};

export function installPageRuntime(win:PageWindow){
  let resolveReady!:()=>void;
  const ready=new Promise<void>(resolve=>{resolveReady=resolve});
  const state:PageState={enabled:true,generation:0,ready};
  let initialized=false,disposed=false,lastErrorGeneration=-1;
  const controls=installPlayerControls(win,state);
  state.transformPlayerData=controls.transformData;
  const data=installDataHooks(win,state);
  const menus=installQuickMenu(win,state);
  win.__youblockRefreshData=data.refreshData;
  const timeout=win.setTimeout(()=>{resolveReady()},2500);
  function updatePredicate(){
    win.__youblockPredicate=undefined;
    const source=state.settings?.filterData.javascript;
    if(!state.enabled||!state.settings?.options.enable_javascript||typeof source!=='string'||!source.trim())return;
    try{
      // Explicit local advanced option only. Never evaluate imported code implicitly.
      const factory=new win.Function(`"use strict"; return (${source});`);
      const predicate=factory();
      if(typeof predicate!=='function')throw Error('The custom filter must evaluate to a function');
      win.__youblockPredicate=predicate;
    }catch(error){win.dispatchEvent(new win.CustomEvent('youblock-predicate-error',{detail:{message:error instanceof Error?error.message:String(error)}}))}
  }
  function onMessage(event:MessageEvent){
    if(disposed||event.source!==win||event.origin!==win.location.origin||event.data?.from!=='YOUBLOCK_CONTENT'||event.data.type!=='storageData')return;
    const payload=event.data.data;
    // Undefined is a real initialized disabled state, not a fabricated startup default.
    state.enabled=payload!==undefined;
    state.settings=payload;
    state.generation++;
    win.__youblockEnabled=state.enabled;
    win.__youblockSettings=state.settings;
    win.__youblockGeneration=state.generation;
    initialized=true;win.clearTimeout(timeout);resolveReady();
    updatePredicate();
    win.dispatchEvent(new win.Event('youblock-settings'));
  }
  function onError(){
    // Predicate diagnostics stay local and never disable ordinary matching rules.
    if(initialized&&state.settings?.options.enable_javascript&&lastErrorGeneration!==state.generation){lastErrorGeneration=state.generation;win.console.warn('YouBlock custom filter could not be evaluated. Check the advanced filter in settings.');}
  }
  win.addEventListener('message',onMessage);
  win.addEventListener('youblock-predicate-error',onError);
  win.postMessage({from:'YOUBLOCK_PAGE',type:'ready'},win.location.origin);
  return {dispose(){if(disposed)return;disposed=true;win.clearTimeout(timeout);resolveReady();win.removeEventListener('message',onMessage);win.removeEventListener('youblock-predicate-error',onError);menus.dispose();data.dispose();controls.dispose();delete win.__youblockPredicate;delete win.__youblockRefreshData;}};
}
if(typeof window!=='undefined'){
 const win=window as PageWindow;
 win.__youblockRuntime ||= installPageRuntime(win);
}
