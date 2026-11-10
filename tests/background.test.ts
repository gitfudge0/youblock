import {beforeEach, describe, expect, it, vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {defaults} from '../src/core/model';

type Reply = {ok:boolean; error?:string; data?:any; token?:string};
const extensionId='youblock-test';
const base=`chrome-extension://${extensionId}/`;
const ui={id:extensionId,url:base+'options.html'};
const youtube={id:extensionId,url:'https://www.youtube.com/watch?v=one'};
let stored:Record<string,any>;
let messageListener:(message:any,sender:any,respond:(reply:Reply)=>void)=>boolean;
let connectListener:(port:any)=>void;
let writes:number;

async function send(type:string,data?:unknown,token?:string,sender:any=ui):Promise<Reply> {
 return new Promise(resolve=>{
  const asynchronous=messageListener({type,data,token},sender,resolve);
  expect(asynchronous).toBe(true);
 });
}
function port(url:string) {
 const p={sender:{url},postMessage:vi.fn(),onDisconnect:{addListener:vi.fn()}};
 connectListener(p);
 return p;
}
async function start(initial:Record<string,any>={}) {
 stored=structuredClone(initial);writes=0;
 vi.stubGlobal('crypto',webcrypto);
 vi.stubGlobal('chrome',{
  runtime:{id:extensionId,getURL:(path:string)=>base+path,
   onMessage:{addListener:(listener:typeof messageListener)=>{messageListener=listener}},
   onConnect:{addListener:(listener:typeof connectListener)=>{connectListener=listener}}},
  storage:{local:{
   get:vi.fn(async()=>structuredClone(stored)),
   set:vi.fn(async(value:Record<string,any>)=>{
    // An asynchronous write models browser storage and catches read/mutate races.
    await new Promise(resolve=>setTimeout(resolve,1));
    Object.assign(stored,structuredClone(value));writes++;
   })}}
 });
 await import('../src/scripts/background');
 return send('get');
}
async function protect() {
 const reply=await send('password','correct horse battery');
 expect(reply.ok).toBe(true);
}
async function unlock() {
 const reply=await send('unlock','correct horse battery');
 expect(reply.ok).toBe(true);
 expect(reply.token).toEqual(expect.any(String));
 return reply.token!;
}
beforeEach(()=>{vi.resetModules();vi.unstubAllGlobals()});

describe('background settings authorization',()=>{
 it('uses defaults when storage only contains the enabled toggle',async()=>{
  const reply=await start({enabled:false});
  expect(reply.data.enabled).toBe(false);
  expect(reply.data.settings).toEqual(defaults());
 });
 it('hashes passwords and rejects locked save, toggle and context writes',async()=>{
  await start();await protect();
  expect(stored.protection.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(stored)).not.toContain('correct horse battery');
  const before=structuredClone(stored);const count=writes;
  for(const [type,data,sender] of [
   ['save',{...defaults(),mode:'blur'},ui],['toggle',false,ui],
   ['contextBlock',{field:'videoId',pattern:'some-video'},youtube],
   ['undoContext','unknown',youtube]
  ] as const) {
   const reply=await send(type,data,undefined,sender);
   expect(reply.ok).toBe(false);expect(reply.error).toMatch(/Unlock/);
  }
  expect(writes).toBe(count);expect(stored).toEqual(before);
  const locked=await send('get');
  expect(locked.data.locked).toBe(true);expect(locked.data.protected).toBe(true);
  expect(locked.data.settings).toEqual(defaults());
 });
 it('rejects incorrect passwords and accepts the correct password',async()=>{
  await start();await protect();
  const wrong=await send('unlock','wrong');
  expect(wrong).toMatchObject({ok:false,error:'Incorrect password'});
  const token=await unlock();
  expect((await send('get',undefined,token)).data.locked).toBe(false);
  expect((await send('save',{...defaults(),mode:'blur'},token)).ok).toBe(true);
  expect(stored.storageData.mode).toBe('blur');
  expect((await send('toggle',false,token)).ok).toBe(true);
  expect(stored.enabled).toBe(false);
 });
 it('invalidates all issued tokens when locked',async()=>{
  await start();await protect();const first=await unlock();const second=await unlock();
  expect((await send('lock',undefined,first)).ok).toBe(true);
  for(const token of [first,second]) {
   expect((await send('get',undefined,token)).data.locked).toBe(true);
   expect((await send('toggle',false,token)).ok).toBe(false);
  }
 });
 it('expires an unlocked session after fifteen minutes',async()=>{
  await start();await protect();const token=await unlock();
  const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+16*60*1000);
  expect((await send('save',defaults(),token)).ok).toBe(false);
  vi.restoreAllMocks();
 });
 it('relocks after the background process restarts',async()=>{
  await start();await protect();const token=await unlock();
  const persisted=structuredClone(stored);vi.resetModules();await start(persisted);
  expect((await send('get',undefined,token)).data.locked).toBe(true);
  expect((await send('toggle',false,token)).ok).toBe(false);
 });
 it('destructively resets rules, mode, protection and enabled state while locked',async()=>{
  const settings=defaults();settings.mode='blur';settings.filterData.title=['secret'];
  await start({storageData:settings,enabled:false});await protect();const token=await unlock();
  await send('lock',undefined,token);
  expect((await send('reset')).ok).toBe(true);
  expect(stored.storageData).toEqual(defaults());
  expect(stored.protection).toBeNull();expect(stored.enabled).toBe(true);
  const state=await send('get');
  expect(state.data.locked).toBe(false);expect(state.data.protected).toBe(false);
 });
 it('rejects page attempts at UI operations and non-extension senders',async()=>{
  await start();
  for(const type of ['save','toggle','reset','password','unlock','get']) {
   expect((await send(type,defaults(),undefined,youtube)).ok).toBe(false);
  }
  expect((await send('contextBlock',{field:'videoId',pattern:'id'},undefined,{...youtube,id:'other-extension'})).ok).toBe(false);
  expect(writes).toBe(0);
 });
});

describe('background content ports and mutation ordering',()=>{
 it('accepts only exact YouTube https origins for filtering ports',async()=>{
  await start();
  const accepted=[port('https://www.youtube.com/'),port('https://m.youtube.com/watch?v=x')];
  const rejected=[port('https://www.youtube.com.evil.test/'),port('http://www.youtube.com/'),port(base+'options.html'),port('https://evil.test/')];
  await Promise.resolve();
  for(const p of accepted) {
   expect(p.postMessage).toHaveBeenCalledOnce();
   expect(p.postMessage.mock.calls[0][0]).toMatchObject({type:'filtersData',data:{enabled:true}});
   expect(p.postMessage.mock.calls[0][0].data).not.toHaveProperty('protection');
   expect(p.postMessage.mock.calls[0][0].data).not.toHaveProperty('token');
  }
  for(const p of rejected)expect(p.postMessage).not.toHaveBeenCalled();
 });
 it('preserves simultaneous context additions and undo without lost updates',async()=>{
  await start();
  const replies=await Promise.all(Array.from({length:8},(_,i)=>send('contextBlock',{field:'videoId',pattern:`video-${i}`},undefined,youtube)));
  expect(replies.every(reply=>reply.ok)).toBe(true);
  expect(stored.storageData.rules.map((rule:any)=>rule.pattern)).toEqual(Array.from({length:8},(_,i)=>`video-${i}`));
  await Promise.all([
   send('undoContext',replies[0].data,undefined,youtube),
   send('contextBlock',{field:'channelId',pattern:'UCchannel'},undefined,youtube)
  ]);
  expect(stored.storageData.rules).toHaveLength(8);
  expect(stored.storageData.rules.some((r:any)=>r.id===replies[0].data)).toBe(false);
  expect(stored.storageData.rules.at(-1).field).toBe('channelId');
 });
 it('continues processing after an invalid mutation without corrupting settings',async()=>{
  await start();
  const bad=await send('contextBlock',{field:'title',pattern:'not a permitted context field'},undefined,youtube);
  expect(bad.ok).toBe(false);expect(writes).toBe(0);
  const good=await send('contextBlock',{field:'videoId',pattern:'valid'},undefined,youtube);
  expect(good.ok).toBe(true);expect(stored.storageData.rules).toHaveLength(1);
 });
});

describe('password boundary and saved-rule recovery regressions',()=>{
 it('rejects passwords above the unlock limit without setting protection',async()=>{
  await start();
  const rejected=await send('password','a'.repeat(1025));
  expect(rejected.ok).toBe(false);
  expect(rejected.error).toMatch(/1024/);
  expect(writes).toBe(0);
  expect((await send('get')).data.protected).toBe(false);
  const password='a'.repeat(1024);
  expect((await send('password',password)).ok).toBe(true);
  const accepted=await send('unlock',password);
  expect(accepted.ok).toBe(true);
  expect(accepted.token).toEqual(expect.any(String));
  expect((await send('get',undefined,accepted.token)).data.locked).toBe(false);
 });
 it('retains valid saved rules when a neighboring saved regex is damaged',async()=>{
  const settings=defaults();
  settings.rules=[
   {id:'bad',field:'title',pattern:'/[/i',action:'hide',enabled:true},
   {id:'good',field:'title',pattern:'safe',action:'blur',enabled:true}
  ];
  settings.filterData.comment=['/[/i','valid comment'];
  const state=await start({storageData:settings});
  expect(state.data.settings.rules).toHaveLength(2);
  expect(state.data.settings.rules.find((r:any)=>r.id==='good')).toEqual(settings.rules[1]);
  expect(state.data.settings.filterData.comment).toEqual(settings.filterData.comment);
  const p=port('https://www.youtube.com/');
  await Promise.resolve();
  const compiled=p.postMessage.mock.calls[0][0].data.compiledStorage;
  expect(compiled.filterData.title).toHaveLength(1);
  expect(compiled.filterData.title[0][2]).toBe('blur');
  expect(new RegExp(compiled.filterData.title[0][0],compiled.filterData.title[0][1]).test('safe video')).toBe(true);
  expect(compiled.filterData.comment).toHaveLength(1);
  // Import/save remains strict: recovery is limited to existing persisted storage.
  const imported=await send('save',settings);
  expect(imported.ok).toBe(false);
  expect(writes).toBe(0);
 });
});
