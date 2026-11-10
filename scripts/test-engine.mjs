// Exercise the replacement engine through real extension worlds and native responses.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(tmpdir(),'youblock-engine-'));
const extension=path.resolve('dist/chrome');
const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true,args:['--no-sandbox',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});const id=new URL(worker.url()).host;
 const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);
 async function save(change){await options.evaluate(async change=>{const r=await chrome.runtime.sendMessage({type:'get'});Object.assign(r.data.settings,change);const s=await chrome.runtime.sendMessage({type:'save',data:r.data.settings});if(!s.ok)throw Error(s.error)},change)}
 const rule={id:'title',field:'title',pattern:'spoiler',action:'blur',enabled:true};await save({rules:[rule],mode:'blur'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://www.youtube.com/youblock-engine-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><ytd-channel-renderer><h3>Safe creator</h3></ytd-channel-renderer><ytd-video-renderer><a href="/watch?v=target"><h3>Spoiler target</h3></a></ytd-video-renderer><script>document.querySelector("ytd-channel-renderer").data={channelId:"UC-safe",title:{simpleText:"Spoiler"}};document.querySelector("ytd-video-renderer").data={videoId:"target",title:{simpleText:"Spoiler target"}};window.ytInitialData={contents:[{videoRenderer:{videoId:"target",title:{simpleText:"Spoiler target"}}}]};window.ytInitialPlayerResponse={videoDetails:{videoId:"safe",title:"Safe player"},playerConfig:{audioConfig:{loudnessDb:7,perceptualLoudnessDb:9,other:5}}};</script></body></html>'}));
 await context.route('https://www.youtube.com/youtubei/v1/search?youblock-engine',route=>route.fulfill({status:201,headers:{'content-type':'application/json','x-youblock-test':'preserved'},body:JSON.stringify({items:[{videoRenderer:{videoId:'api-blocked',title:{simpleText:'Spoiler API'}}},{videoRenderer:{videoId:'api-safe',title:{simpleText:'A safe API title'}}}]})}));
 await page.goto('https://www.youtube.com/youblock-engine-fixture');
 await page.locator('ytd-video-renderer[data-yb-action="blur"]').waitFor({state:'attached'});
 assert.equal(await page.locator('ytd-channel-renderer').getAttribute('data-yb-action'),null,'A title-only rule cannot block a channel name');
 assert.equal(await page.evaluate(()=>window.ytInitialData.contents[0].videoRenderer.__youblockAction),'blur','Initial data is annotated');
 const response=await page.evaluate(async()=>{const r=await fetch('/youtubei/v1/search?youblock-engine');return {status:r.status,header:r.headers.get('x-youblock-test'),data:await r.json()}});
 assert.equal(response.status,201);assert.equal(response.header,'preserved');assert.equal(response.data.items.length,2);
 assert.equal(response.data.items[0].videoRenderer.__youblockAction,'blur');assert.equal(response.data.items[1].videoRenderer.__youblockAction,undefined);
 const current=await options.evaluate(async()=>(await chrome.runtime.sendMessage({type:'get'})).data.settings);
 await save({rules:[],filterData:{...current.filterData,javascript:'(meta, kind) => kind === "videoRenderer" && meta.title.includes("target")'},options:{...current.options,enable_javascript:true}});
 await page.waitForFunction(()=>typeof window.__youblockPredicate==='function'&&document.querySelector('ytd-video-renderer')?.getAttribute('data-yb-action')==='blur');
 assert.equal(await page.locator('ytd-channel-renderer').getAttribute('data-yb-action'),null);
 await save({options:{...current.options,disable_db_normalize:true},filterData:current.filterData});
 await page.waitForFunction(()=>window.ytInitialPlayerResponse.playerConfig.audioConfig.loudnessDb===0);
 assert.equal(await page.evaluate(()=>window.ytInitialPlayerResponse.playerConfig.audioConfig.other),5);
 await save({options:current.options});
 await page.waitForFunction(()=>window.ytInitialPlayerResponse.playerConfig.audioConfig.loudnessDb===7);
 await page.waitForFunction(()=>!document.querySelector('[data-yb-action]'));
 assert.deepEqual(errors,[]);
 console.log('Actual independent engine passed: initial-data and fetch annotations, status/header preservation, channel isolation, typed predicates, audio-metadata toggle, and restoration');
}finally{await context.close();await rm(profile,{recursive:true,force:true})}
