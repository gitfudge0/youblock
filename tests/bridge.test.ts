import {afterEach, describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {transform,build} from 'esbuild';
import {compile,defaults} from '../src/core/model';

const contentSource=readFileSync(new URL('../src/scripts/content.ts',import.meta.url),'utf8');
const pageBundle=build({entryPoints:['src/scripts/page.ts'],bundle:true,format:'iife',write:false}).then(result=>result.outputFiles[0].text);
const documents:JSDOM[]=[];
afterEach(()=>{for(const dom of documents.splice(0))dom.window.close();vi.useRealTimers()});
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));

async function bridge({feedback=true,confirm=true,response={ok:true,data:'added-rule'}}={}) {
 const dom=new JSDOM('<html><head></head><body></body></html>',{url:'https://m.youtube.com/watch?v=one',runScripts:'outside-only'});
 documents.push(dom);const win=dom.window as any;
 win.structuredClone=structuredClone;Object.assign(win,{Request,Response,Headers,fetch:vi.fn(async()=>new Response('{}'))});
 win.matchMedia=()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const errors:string[]=[];win.addEventListener('error',(event:any)=>{errors.push(event.message);event.preventDefault()});
 const messages:any[]=[];let filters:(message:any)=>void=()=>{};
 let finish!:(value:any)=>void;
 const pending=new Promise(resolve=>finish=resolve);
 const write=vi.fn(()=>pending);
 const disconnects:Array<()=>void>=[];
 const connect=vi.fn(()=>({disconnect:vi.fn(),onMessage:{addListener:(cb:typeof filters)=>filters=cb},onDisconnect:{addListener:(cb:()=>void)=>disconnects.push(cb)}}));
 win.chrome={runtime:{id:'test-extension',connect,sendMessage:write}};
 win.confirm=vi.fn(()=>confirm);win.alert=vi.fn();
 win.postMessage=(data:any)=>{messages.push(data);win.dispatchEvent(new win.MessageEvent('message',{source:win,origin:win.location.origin,data}))};
 vm.runInContext((await transform(contentSource,{loader:'ts'})).code,dom.getInternalVMContext());
 const settings=defaults();settings.options.block_feedback=feedback;
 const loadFilters=()=>filters({type:'filtersData',data:{compiledStorage:compile(settings),enabled:true}});
 const pageSource=await pageBundle;
 const loadEngine=()=>vm.runInContext(pageSource,dom.getInternalVMContext());
 const native=vi.fn();
 const element=win.document.createElement('ytd-video-renderer');
 element.innerHTML='<a href="/watch?v=one"><h3>Video one</h3></a>';
 element.data={videoId:'one',title:{simpleText:'Video one'},menu:{menuRenderer:{items:[{menuServiceItemRenderer:{text:{simpleText:'Not interested'},icon:{iconType:'NOT_INTERESTED'},serviceEndpoint:{feedbackEndpoint:{feedbackToken:'fixture-token'}}}}]}}};
 element.addEventListener('yt-service-request',native);win.document.body.append(element);
 const click=()=>{const event=new win.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:20});element.dispatchEvent(event);const button=Array.from(win.document.querySelectorAll('[role="menuitem"]')).find((node:any)=>node.textContent==='Block this video') as HTMLElement;if(!button)throw Error('Quick-block menu did not open');button.click();return {event}};
 return {win,errors,messages,write,connect,disconnect:()=>disconnects.at(-1)!(),native,element,click,loadFilters,loadEngine,complete:()=>finish(response)};
}

describe('isolated settings bridge and native menu confirmation',()=>{
 it('never releases startup hooks with a fabricated disabled state and replays initialized filters',async()=>{
  const b=await bridge();
  b.win.postMessage({from:'YOUBLOCK_PAGE',type:'ready'});
  expect(b.messages.filter(m=>m.type==='storageData')).toHaveLength(0);
  b.loadEngine();b.loadFilters();
  expect(b.win.__youblockEnabled).toBe(true);
  expect(b.win.__youblockSettings).toBeDefined();
  b.win.postMessage({from:'YOUBLOCK_PAGE',type:'ready'});
  expect(b.messages.filter(m=>m.type==='storageData')).toHaveLength(2);
  expect(b.messages.filter(m=>m.type==='storageData').every(m=>m.data)).toBe(true);
 });
 it('recovers settings that arrived before the MAIN-world listener was installed',async()=>{
  const b=await bridge();b.loadFilters();
  expect(b.win.__youblockSettings).toBeUndefined();
  b.loadEngine();
  expect(b.win.__youblockEnabled).toBe(true);
  expect(b.win.__youblockSettings).toBeDefined();
  expect(b.messages.filter(m=>m.type==='storageData')).toHaveLength(2);
 });
 it('waits for a successful write before running native feedback, and consumes confirmations once',async()=>{
  const b=await bridge();b.loadEngine();b.loadFilters();
  const {event}=b.click();
  expect(event.defaultPrevented).toBe(true);
  expect(b.write).toHaveBeenCalledWith({type:'contextBlock',data:{field:'videoId',pattern:'one'}});
  expect(b.native).not.toHaveBeenCalled();
  expect(b.messages.some(m=>m.type==='contextBlockConfirmed')).toBe(false);
  b.complete();await turn();expect(b.native).toHaveBeenCalledTimes(1);
  const confirmation=b.messages.find(m=>m.type==='contextBlockConfirmed');
  b.win.postMessage(confirmation);expect(b.native).toHaveBeenCalledTimes(1);
 });
 it('does not mutate settings or invoke native actions when the user cancels',async()=>{
  const b=await bridge({confirm:false});b.loadEngine();b.loadFilters();b.click();await turn();
  expect(b.write).not.toHaveBeenCalled();expect(b.native).not.toHaveBeenCalled();
  expect(b.messages.some(m=>m.type==='contextBlockConfirmed')).toBe(false);
 });
 it('does not run feedback when protected settings reject a context write',async()=>{
  const b=await bridge({response:{ok:false,error:'Unlock settings before making changes'} as any});
  b.loadEngine();b.loadFilters();b.click();b.complete();await turn();
  expect(b.native).not.toHaveBeenCalled();expect(b.win.alert).toHaveBeenCalledWith('Unlock settings before making changes');
  expect(b.messages.some(m=>m.type==='contextBlockConfirmed')).toBe(false);
 });
 it('suppresses fabricated native dismissal endpoints when feedback is disabled',async()=>{
  const b=await bridge({feedback:false});b.loadEngine();b.loadFilters();b.click();b.complete();await turn();
  expect(b.messages.some(m=>m.type==='contextBlockConfirmed')).toBe(true);
  expect(b.native).not.toHaveBeenCalled();
 });
 it('ignores requests from unrelated windows or origins',async()=>{
  const b=await bridge();b.loadEngine();b.loadFilters();
  b.win.dispatchEvent(new b.win.MessageEvent('message',{source:null,origin:b.win.location.origin,data:{from:'YOUBLOCK_PAGE',type:'contextBlockData',data:{type:'videoId',info:{id:'one'}}}}));
  b.win.dispatchEvent(new b.win.MessageEvent('message',{source:b.win,origin:'https://example.com',data:{from:'YOUBLOCK_PAGE',type:'contextBlockData',data:{type:'videoId',info:{id:'one'}}}}));
  await turn();expect(b.write).not.toHaveBeenCalled();expect(b.native).not.toHaveBeenCalled();
 });
});


describe('extension context lifecycle',()=>{
 it('stops reconnecting when extension reload invalidates the old context',async()=>{
  const b=await bridge();b.loadEngine();b.loadFilters();vi.useFakeTimers();
  b.win.chrome.runtime.id=undefined;
  b.connect.mockImplementation(()=>{throw new Error('Extension context invalidated.')});
  b.disconnect();await vi.advanceTimersByTimeAsync(5000);
  expect(b.connect).toHaveBeenCalledTimes(1);
  expect(b.win.__youblockEnabled).toBe(true);
  expect(b.win.document.querySelector('[data-youblock-bridge-notice]')?.textContent).toContain('Reload this YouTube tab');
 });
 it('handles invalidation racing the reconnect call without an uncaught timer error',async()=>{
  const b=await bridge();vi.useFakeTimers();
  b.connect.mockImplementation(()=>{throw new Error('Extension context invalidated.')});
  b.disconnect();await vi.advanceTimersByTimeAsync(5000);
  expect(b.connect).toHaveBeenCalledTimes(2);expect(b.errors).toEqual([]);
 });
 it('reconnects only once after duplicate transient disconnect notifications',async()=>{
  const b=await bridge();vi.useFakeTimers();b.disconnect();b.disconnect();
  await vi.advanceTimersByTimeAsync(1000);expect(b.connect).toHaveBeenCalledTimes(2);
  b.loadFilters();expect(b.messages.some(m=>m.type==='storageData'&&m.data)).toBe(true);
 });
 it('catches a rejected context write and never acknowledges native feedback',async()=>{
  const b=await bridge();b.loadEngine();b.loadFilters();
  b.write.mockRejectedValueOnce(new Error('Extension context invalidated.'));
  b.click();await turn();
  expect(b.messages.some(m=>m.type==='contextBlockConfirmed')).toBe(false);
  expect(b.native).not.toHaveBeenCalled();
  expect(b.win.document.querySelector('[data-youblock-bridge-notice]')?.textContent).toContain('Reload this YouTube tab');
 });
});


describe('content bridge shutdown and request races',()=>{
 it('retries a transient connect exception and recovers with fresh filters',async()=>{
  const b=await bridge();vi.useFakeTimers();b.connect.mockImplementationOnce(()=>{throw new Error('Background temporarily unavailable')});
  b.disconnect();await vi.advanceTimersByTimeAsync(2000);
  expect(b.connect).toHaveBeenCalledTimes(3);b.loadFilters();expect(b.errors).toEqual([]);
  expect(b.messages.some(m=>m.type==='storageData'&&m.data)).toBe(true);
 });
 it('does not confirm a completed write after the context has been invalidated',async()=>{
  const b=await bridge();b.loadEngine();b.loadFilters();b.click();
  b.win.chrome.runtime.id=undefined;b.complete();await turn();
  expect(b.messages.some(m=>m.type==='contextBlockConfirmed')).toBe(false);
  expect(b.native).not.toHaveBeenCalled();
 });
 it('handles Undo invalidation without an unhandled rejection',async()=>{
  const b=await bridge();b.loadEngine();b.loadFilters();b.click();b.complete();await turn();
  b.write.mockRejectedValueOnce(new Error('Extension context invalidated.'));
  const undo=Array.from(b.win.document.querySelectorAll('button')).find((node:any)=>node.textContent==='Undo') as any;
  expect(undo).toBeDefined();undo.click();await turn();
  expect(b.win.document.querySelector('[data-youblock-bridge-notice]')?.textContent).toContain('Reload this YouTube tab');
  expect(b.errors).toEqual([]);
 });
 it('cancels pending reconnects when the document is leaving',async()=>{
  const b=await bridge();vi.useFakeTimers();b.disconnect();
  b.win.dispatchEvent(new b.win.PageTransitionEvent('pagehide',{persisted:false}));
  await vi.advanceTimersByTimeAsync(5000);expect(b.connect).toHaveBeenCalledTimes(1);expect(b.errors).toEqual([]);
 });
});
