import {defaults, normalize, compile, type Settings} from '../core/model';
let settings:Settings=defaults(), enabled=true;
let protection:{salt:string;hash:string}|null=null;
const tokens=new Map<string,number>();
const ports=new Set<chrome.runtime.Port>();
const ready=(async()=>{const data=await chrome.storage.local.get(['storageData','enabled','protection']);try{if(data.storageData)settings=normalize(data.storageData,true)}catch(e){console.error('Settings need recovery',e)}enabled=data.enabled!==false;protection=data.protection||null})();
function authorized(token:string){return !protection||(tokens.get(token)||0)>Date.now()}
async function persist(){await chrome.storage.local.set({storageData:settings,enabled,protection});broadcast()}
function payload(){return {type:'filtersData',data:{compiledStorage:compile(settings),enabled}}}
function broadcast(){for(const p of ports){try{p.postMessage(payload())}catch{ports.delete(p)}}}
async function hash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return Array.from(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:210000},key,256))).map(b=>b.toString(16).padStart(2,'0')).join('')}
chrome.runtime.onConnect.addListener(port=>{if(!port.sender?.url?.match(/^https:\/\/(www|m)\.youtube\.com\//))return;ports.add(port);port.onDisconnect.addListener(()=>ports.delete(port));ready.then(()=>port.postMessage(payload()))});
// All writes are serialized. Page-world messages can only request a validated context rule;
// they never receive UI tokens or password material.
let queue=Promise.resolve();
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
 const ui=sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL(''));
 const youtube=sender.id===chrome.runtime.id&&/^https:\/\/(www|m)\.youtube\.com\//.test(sender.url||'');
 queue=queue.catch(()=>{}).then(async()=>{await ready;try{
 if(!ui&&!(youtube&&['contextBlock','undoContext'].includes(msg.type)))throw Error('Invalid message source');
 let result:any,token:string|undefined;
 if(msg.type==='get'){result={settings:authorized(msg.token)?settings:defaults(),enabled,locked:!authorized(msg.token),protected:!!protection}}
 else if(msg.type==='unlock'){
 if(typeof msg.data!=='string'||msg.data.length>1024)throw Error('Invalid password');
 if(protection&&await hash(msg.data,protection.salt)!==protection.hash)throw Error('Incorrect password');
 token=crypto.randomUUID();tokens.set(token,Date.now()+15*60*1000);
 }else if(msg.type==='reset'){
 // Destructive recovery is deliberately available while locked, never a silent unlock.
 settings=defaults();protection=null;enabled=true;tokens.clear();await persist();
 }else{
 if(!authorized(msg.token))throw Error('Unlock settings before making changes');
 switch(msg.type){
 case 'save':settings=normalize(msg.data);await persist();break;
 case 'toggle':if(typeof msg.data!=='boolean')throw Error('Invalid protection state');enabled=msg.data;await persist();break;
 case 'lock':tokens.clear();break;
 case 'password':{if(msg.data===''){protection=null;tokens.clear();await persist();break}if(typeof msg.data!=='string'||msg.data.length<8||msg.data.length>1024)throw Error('Use 8 to 1024 characters');const salt=crypto.randomUUID();protection={salt,hash:await hash(msg.data,salt)};tokens.clear();await persist();break}
 case 'contextBlock':{
 const {field,pattern}=msg.data||{};if(!['videoId','channelId'].includes(field)||typeof pattern!=='string'||!pattern||pattern.length>200)throw Error('Invalid context rule');
 const rule={id:crypto.randomUUID(),field,pattern,action:'inherit' as const,enabled:true};settings.rules.push(rule);await persist();result=rule.id;break;
 }
 case 'undoContext':settings.rules=settings.rules.filter(r=>r.id!==msg.data);await persist();break;
 default:throw Error('Unknown operation');
 }
 }
 respond({ok:true,data:result,token});
 }catch(e){respond({ok:false,error:e instanceof Error?e.message:'Operation failed'})}});
 return true;
});
