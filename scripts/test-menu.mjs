// Actual Chrome manifest, MAIN menu, isolated confirmation, and protected background writes.
// The controlled page captures the optional native feedback event; it never calls YouTube.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(tmpdir(),'youblock-menu-'));
const extension=path.resolve('dist/chrome');
const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true,args:['--no-sandbox',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try {
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
 const id=new URL(worker.url()).host;
 const settings=await context.newPage();await settings.goto(`chrome-extension://${id}/options.html`);
 async function configure(feedback){await settings.evaluate(async feedback=>{const r=await chrome.runtime.sendMessage({type:'get'});r.data.settings.mode='blur';r.data.settings.rules=[];r.data.settings.options.block_feedback=feedback;const saved=await chrome.runtime.sendMessage({type:'save',data:r.data.settings});if(!saved.ok)throw Error(saved.error)},feedback)}
 async function stored(){return worker.evaluate(async()=>(await chrome.storage.local.get('storageData')).storageData.rules)}
 const fixture='<!doctype html><html><head><style>body{margin:24px;background:#0f0f0f;color:#fff;font:16px system-ui}ytd-video-renderer{display:block;width:460px;border:1px solid #444;border-radius:16px}a{display:block;color:inherit;padding:16px;text-decoration:none}.thumbnail{height:180px;background:linear-gradient(35deg,#874b18,#4d77ba,#4e2434)}ytd-menu-renderer{display:inline-block;margin:8px}</style></head><body><ytd-video-renderer><a href="/watch?v=menu-video"><div class="thumbnail"></div><h3 id="video-title">Menu fixture title</h3></a><a href="/channel/UC-menu-exact">Menu creator</a><ytd-menu-renderer>Native menu</ytd-menu-renderer></ytd-video-renderer></body></html>';
 await context.route('https://www.youtube.com/youblock-menu-fixture',route=>route.fulfill({contentType:'text/html',body:fixture}));
 const page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 async function load(){
  await page.goto('https://www.youtube.com/youblock-menu-fixture');
  await page.evaluate(()=>{
   window.__menuFeedback=[];window.__menuRequests=[];window.__menuAcks=[];
   const host=document.querySelector('ytd-video-renderer');
   host.data={videoId:'menu-video',title:{simpleText:'Menu fixture title'},shortBylineText:{runs:[{text:'Menu creator',navigationEndpoint:{browseEndpoint:{browseId:'UC-menu-exact'}}}]},menu:{menuRenderer:{items:[{menuServiceItemRenderer:{text:{simpleText:'Not interested'},icon:{iconType:'NOT_INTERESTED'},serviceEndpoint:{feedbackEndpoint:{feedbackToken:'fixture-only-feedback-token'}}}}]}}};
   host.addEventListener('yt-service-request',event=>{event.preventDefault();event.stopImmediatePropagation();window.__menuFeedback.push(event.detail.endpoint)});
   window.addEventListener('message',event=>{if(event.source!==window||event.origin!==location.origin)return;if(event.data?.from==='YOUBLOCK_PAGE'&&event.data.type==='contextBlockData')window.__menuRequests.push(event.data.data);if(event.data?.from==='YOUBLOCK_CONTENT'&&event.data.type==='contextBlockConfirmed')window.__menuAcks.push(event.data.data)});
  });
  await page.locator('[data-youblock-action-trigger]').waitFor();
 }
 async function contextMenu(){await page.locator('#video-title').click({button:'right'});await page.getByRole('menu',{name:'YouBlock actions'}).waitFor()}
 async function block(name,accept){await contextMenu();const dialog=page.waitForEvent('dialog');const click=page.getByRole('menuitem',{name,exact:true}).click();const prompt=await dialog;assert.equal(prompt.type(),'confirm');if(accept)await prompt.accept();else await prompt.dismiss();await click;await page.waitForFunction(()=>window.__menuRequests.length>0)}
 await configure(true);await load();
 await block('Block this video',false);
 assert.equal((await stored()).length,0,'Cancel cannot save a rule');
 assert.equal(await page.evaluate(()=>window.__menuAcks.length),0,'Cancel cannot acknowledge native feedback');
 assert.equal(await page.evaluate(()=>window.__menuFeedback.length),0,'Cancel cannot dispatch native feedback');

 await block('Block this video',true);
 await page.waitForFunction(()=>document.querySelector('ytd-video-renderer')?.getAttribute('data-yb-action')==='blur');
 await page.waitForFunction(()=>window.__menuFeedback.length===1);
 const videoRules=await stored();assert.equal(videoRules.length,1);assert.equal(videoRules[0].field,'videoId');assert.equal(videoRules[0].pattern,'menu-video');
 assert.equal(await page.evaluate(()=>window.__menuAcks.length),1);
 assert.deepEqual(await page.evaluate(()=>window.__menuFeedback[0]),{feedbackEndpoint:{feedbackToken:'fixture-only-feedback-token'}});
 assert.equal(await page.locator('ytd-menu-renderer').textContent(),'Native menu','Native menu stays intact');
 const ack=await page.evaluate(()=>window.__menuAcks[0]);
 await page.evaluate(ack=>window.postMessage({from:'YOUBLOCK_CONTENT',type:'contextBlockConfirmed',data:ack},location.origin),ack);
 // The single-use token is consumed synchronously by the page listener on delivery.
 await page.waitForFunction(()=>window.__menuAcks.length===2);
 assert.equal(await page.evaluate(()=>window.__menuFeedback.length),1,'Repeated acknowledgments cannot duplicate feedback');
 await mkdir('artifacts/qa',{recursive:true});await page.screenshot({path:'artifacts/qa/quick-block-confirmed.png'});
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('[data-yb-action]'));
 assert.equal((await stored()).length,0,'Undo removes the persisted rule');
 assert.equal(await page.locator('ytd-video-renderer a').first().getAttribute('inert'),null,'Undo restores card interaction');
 assert.equal(await page.evaluate(()=>window.__menuFeedback.length),1,'Undo does not pretend to reverse feedback already sent');

 await configure(false);await load();
 await block('Block this channel',true);
 await page.waitForFunction(()=>document.querySelector('ytd-video-renderer')?.getAttribute('data-yb-action')==='blur');
 await page.waitForFunction(()=>window.__menuAcks.length===1);
 const channelRules=await stored();assert.equal(channelRules.length,1);assert.equal(channelRules[0].field,'channelId');assert.equal(channelRules[0].pattern,'UC-menu-exact');
 assert.equal(await page.evaluate(()=>window.__menuFeedback.length),0,'Opt-out never dispatches the native feedback endpoint');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-yb-action]'));assert.equal((await stored()).length,0);
 const trigger=page.getByRole('button',{name:'YouBlock actions',exact:true});await trigger.focus();await page.keyboard.press('Enter');await page.getByRole('menu',{name:'YouBlock actions'}).waitFor();await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('[data-youblock-quick-menu]')&&document.activeElement?.hasAttribute('data-youblock-action-trigger'));
 assert.deepEqual(errors,[]);
 console.log('Actual Chrome quick-menu integration passed: cancel, exact video/channel persistence, optional single-use feedback dispatch, Undo/restoration, native-menu preservation, and keyboard dismissal');
}finally{await context.close();await rm(profile,{recursive:true,force:true})}
