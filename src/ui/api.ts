import type {State, Settings} from '../core/model';
let token='';
export async function request(type:string,data?:unknown):Promise<any>{
 const res=await chrome.runtime.sendMessage({type,data,token});
 if(!res?.ok)throw new Error(res?.error||'Extension connection unavailable');
 if(res.token)token=res.token;
 return res.data;
}
export const api={get:()=>request('get') as Promise<State>, save:(settings:Settings)=>request('save',settings),toggle:(enabled:boolean)=>request('toggle',enabled),unlock:(password:string)=>request('unlock',password),lock:async()=>{await request('lock');token=''},password:(password:string)=>request('password',password),reset:()=>request('reset')};
