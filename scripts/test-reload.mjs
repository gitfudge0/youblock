// Reload the actual extension while an existing YouTube tab remains open.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(tmpdir(),'youblock-reload-'));
const extension=path.resolve('dist/chrome');
const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--enable-unsafe-extension-debugging']});
try {
 const browser=await context.browser().newBrowserCDPSession();
 const manager=await context.newPage();await manager.goto('chrome://extensions');
 await manager.locator('#devMode').click();await manager.close();
 const {id}=await browser.send('Extensions.loadUnpacked',{path:extension});
 const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);
 await options.evaluate(async()=>{const s=await chrome.runtime.sendMessage({type:'get'});s.data.settings.mode='blur';s.data.settings.rules=[{id:'reload',field:'title',pattern:'spoiler',action:'blur',enabled:true}];const r=await chrome.runtime.sendMessage({type:'save',data:s.data.settings});if(!r.ok)throw Error(r.error)});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
 await context.route('https://www.youtube.com/youblock-reload-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>body{background:#111;color:white;font:16px system-ui;padding:24px}ytd-video-renderer{display:block;width:450px;height:250px;background:linear-gradient(35deg,#874b18,#4d77ba,#4e2434)}a{display:block;padding:24px;color:white}</style></head><body><ytd-video-renderer><a href="/watch?v=one"><h3>Spoiler ending</h3></a></ytd-video-renderer></body></html>'}));
 const page=await context.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error'&&/extension context invalidated|runtime\.lastError/i.test(message.text()))errors.push(message.text())});
 await page.goto('https://www.youtube.com/youblock-reload-fixture');await page.locator('[data-yb-action="blur"]').waitFor({state:'attached'});
 await worker.evaluate(()=>{setTimeout(()=>chrome.runtime.reload(),50)});
 await page.locator('[data-youblock-bridge-notice]').waitFor({timeout:15000});
 // Observe more than two old retry intervals, rather than only the first disconnect.
 await page.waitForTimeout(2500);
 assert.deepEqual(errors,[],'Reload must not emit uncaught invalid-context errors');
 assert.equal(await page.locator('[data-youblock-bridge-notice]').count(),1);
 assert.match(await page.locator('[data-youblock-bridge-notice]').textContent(),/Reload this YouTube tab/);
 assert.equal(await page.locator('[data-yb-action="blur"]').count(),1,'Last valid filtering remains active until tab reload');
 await mkdir('artifacts/qa',{recursive:true});await page.screenshot({path:'artifacts/qa/extension-reload-notice.png'});
 const registry=await browser.send('Extensions.getExtensions');
 assert.equal(registry.extensions.find(item=>item.id===id)?.enabled,true,'Developer-mode extension reload remains enabled');
 await page.reload();await page.locator('[data-yb-action="blur"]').waitFor({state:'attached'});
 assert.equal(await page.locator('[data-youblock-bridge-notice]').count(),0,'Reloading the tab reconnects a fresh content context');
 assert.deepEqual(errors,[]);
 console.log('Actual Chrome extension reload: no uncaught errors or retry loop, one reload notice, cached filtering retained, and tab reload recovered');
}finally{await context.close();await rm(profile,{recursive:true,force:true})}
