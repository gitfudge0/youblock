let compiled:unknown, enabled=false, initialized=false;
let port:chrome.runtime.Port|undefined;
let reconnectTimer:number|undefined;
let stopped=false;

function runtimeAvailable(){try{return Boolean(chrome.runtime?.id)}catch{return false}}
function invalidated(error:unknown){return !runtimeAvailable()||/extension context invalidated/i.test(String(error instanceof Error?error.message:error))}
function notice(message:string){
 const root=document.documentElement;
 if(!root){document.addEventListener('DOMContentLoaded',()=>notice(message),{once:true});return}
 let box=document.querySelector<HTMLElement>('[data-youblock-bridge-notice]');
 if(!box){box=document.createElement('div');box.setAttribute('data-youblock-bridge-notice','');box.setAttribute('role','status');box.style.cssText='position:fixed;bottom:24px;left:24px;right:24px;max-width:480px;z-index:2147483647;padding:16px;background:#171918;color:white;border:1px solid #444;border-radius:14px;font:14px/1.5 system-ui;box-shadow:0 8px 32px #0005';root.append(box)}
 box.textContent=message;
}
function stop(showReload:boolean){
 if(stopped)return;
 stopped=true;
 if(reconnectTimer!==undefined){window.clearTimeout(reconnectTimer);reconnectTimer=undefined}
 const oldPort=port;port=undefined;
 try{oldPort?.disconnect()}catch{/* The old extension context may already be gone. */}
 window.removeEventListener('message',onMessage);
 window.removeEventListener('pagehide',onPageHide);
 // Keep the last real filters in MAIN world until the user reloads the tab.
 if(showReload)notice('YouBlock disconnected. Reload this YouTube tab to reconnect.');
}
function failure(error:unknown){if(invalidated(error))stop(true);else alert(error instanceof Error?error.message:String(error))}
function send(){
 if(stopped||!initialized)return;
 if(!runtimeAvailable()){stop(true);return}
 window.postMessage({from:'YOUBLOCK_CONTENT',type:'storageData',data:enabled?structuredClone(compiled):undefined},location.origin);
}
function scheduleReconnect(){
 if(stopped)return;
 if(!runtimeAvailable()){stop(true);return}
 if(reconnectTimer!==undefined)return;
 reconnectTimer=window.setTimeout(()=>{reconnectTimer=undefined;connect()},1000);
}
function connect(){
 if(stopped)return;
 if(!runtimeAvailable()){stop(true);return}
 try{
  const connection=chrome.runtime.connect();port=connection;
  connection.onMessage.addListener(msg=>{if(stopped||port!==connection)return;if(msg.type==='filtersData'){initialized=true;compiled=msg.data.compiledStorage;enabled=msg.data.enabled;send()}});
  connection.onDisconnect.addListener(()=>{
   // Consume lastError within the callback, including ordinary background restarts.
   let error:unknown;try{error=chrome.runtime.lastError?.message}catch(e){error=e}
   if(stopped||port!==connection)return;
   port=undefined;
   if(invalidated(error)){stop(true);return}
   scheduleReconnect();
  });
 }catch(error){if(invalidated(error))stop(true);else scheduleReconnect()}
}
async function request(message:unknown){
 if(stopped)return;
 if(!runtimeAvailable()){stop(true);return}
 try{
  const response=await chrome.runtime.sendMessage(message);
  if(stopped)return;
  if(!runtimeAvailable()){stop(true);return}
  return response;
 }catch(error){failure(error)}
}
async function onMessage(event:MessageEvent){
 if(stopped||event.source!==window||event.origin!==location.origin||event.data?.from!=='YOUBLOCK_PAGE')return;
 try{
  if(event.data.type==='ready')send();
  if(event.data.type!=='contextBlockData'||stopped)return;
  if(!runtimeAvailable()){stop(true);return}
  const {type,info,requestId}=event.data.data||{};
  if(!['videoId','channelId'].includes(type)||!info?.id)return;
  const pattern=Array.isArray(info.id)?info.id[0]:info.id;
  if(typeof pattern!=='string'||!confirm(`Add a ${type==='videoId'?'video':'channel'} rule for ${info.text||pattern}?`))return;
  const response=await request({type:'contextBlock',data:{field:type,pattern}});
  if(!response)return;
  if(!response.ok){alert(response.error);return}
  if(typeof requestId==='string')window.postMessage({from:'YOUBLOCK_CONTENT',type:'contextBlockConfirmed',data:{requestId}},location.origin);
  const box=document.createElement('div');box.style.cssText='position:fixed;bottom:24px;left:24px;z-index:2147483647;padding:16px;background:#171918;color:white;border-radius:14px;font:14px system-ui;box-shadow:0 8px 32px #0005';
  box.textContent='YouBlock rule added. ';const button=document.createElement('button');button.textContent='Undo';button.onclick=async()=>{
   const result=await request({type:'undoContext',data:response.data});if(!result)return;
   if(!result.ok)alert(result.error);else box.remove();
  };box.append(button);document.documentElement.append(box);window.setTimeout(()=>box.remove(),10000);
 }catch(error){failure(error)}
}
function onPageHide(event:PageTransitionEvent){if(!event.persisted)stop(false)}
window.addEventListener('message',onMessage);
window.addEventListener('pagehide',onPageHide);
connect();
