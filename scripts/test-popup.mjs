// Uses the actual chrome.action popup target, not a tab with a simulated viewport.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(tmpdir(),'youblock-popup-'));
const extension=path.resolve('dist/chrome');
const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true,args:['--no-sandbox',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try {
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
 const browser=await context.browser().newBrowserCDPSession();
 await worker.evaluate(()=>chrome.action.openPopup());
 let target;
 for(let n=0;n<40&&!target;n++) {target=(await browser.send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/popup.html'));if(!target)await new Promise(r=>setTimeout(r,50))}
 assert.ok(target,'Native toolbar popup target opened');
 const {sessionId}=await browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
 let serial=0;const pending=new Map();
 browser.on('Target.receivedMessageFromTarget',event=>{if(event.sessionId===sessionId){const response=JSON.parse(event.message);if(response.id){pending.get(response.id)?.(response);pending.delete(response.id)}}});
 async function send(method,params={}) {const id=++serial;const reply=new Promise(resolve=>pending.set(id,resolve));await browser.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});const response=await reply;if(response.error)throw Error(response.error.message);return response.result}
 async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value}
 async function waitFor(expression){for(let n=0;n<60;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50))}throw Error('Popup condition not met: '+expression)}
 await waitFor('!!document.querySelector(".popup-count")');
 const dimensions=await evaluate('({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,contentWidth:document.querySelector("main").getBoundingClientRect().width})');
 assert.equal(dimensions.contentWidth,380,'Native popup must negotiate its intended content width');
 assert.ok(dimensions.width>=380&&dimensions.width<=400,'Native viewport only adds its scrollbar gutter');
 assert.equal(dimensions.scrollWidth,dimensions.width,'Native popup must not overflow horizontally');
 async function screenshot(name){await mkdir('artifacts/qa',{recursive:true});const result=await send('Page.captureScreenshot');await writeFile(`artifacts/qa/popup-${name}.png`,Buffer.from(result.data,'base64'))}
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await waitFor('getComputedStyle(document.querySelector("main > div")).opacity === "1"');
 assert.ok(await evaluate('document.querySelector("footer").getBoundingClientRect().bottom <= innerHeight+1'),'Default popup footer must be visible without scrolling');
 assert.equal(await evaluate('getComputedStyle(document.documentElement).backgroundColor'),'rgb(8, 8, 8)','Popup is near-black independently of system theme');
 await screenshot('native');
 // State motion is short, composited, and disabled for keyboard/reduced motion.
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".mode-indicator")).transitionDuration'),'0.16s');
 await evaluate('document.querySelector(".mode-switch button:last-child").click()');
 await waitFor('document.querySelector(".mode-switch").dataset.mode === "blur"');
 await waitFor('!document.querySelector(".mode-switch button:last-child").disabled');
 assert.equal(await evaluate('document.querySelector(".mode-switch button:last-child").getAttribute("aria-pressed")'),'true');
 assert.match(await evaluate('document.querySelector(".mode-preview").textContent'),/heavily blurred/i);
 assert.equal(await evaluate('document.querySelector(".mode-preview").scrollHeight > document.querySelector(".mode-preview").clientHeight'),false,'Mode description must contain its content');
 assert.equal(await evaluate('!!document.querySelector(".preview-card,.preview-cover")'),false,'Mode explanation has no layered placeholder remnants');
 await screenshot('blur');
 await evaluate('document.querySelector(".mode-switch button:first-of-type").click()');
 await waitFor('document.querySelector(".mode-switch").dataset.mode === "hide"');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".mode-indicator")).transitionDuration'),'0s');
 await screenshot('dark');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'no-preference'}]});
 await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Add a rule")).focus()');
 // Headless native-popup targets do not receive trusted CDP key activation.
 // Exercise the native DOM handlers here and real keyboard activation in options below.
 await evaluate('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); document.activeElement.click()');
 await waitFor('!!document.querySelector(".rule-form")');
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".editor-entry")).transitionDuration'),'0s','Keyboard entry is instant');
 assert.equal(await evaluate('document.activeElement.tagName'),'TEXTAREA');
 assert.equal(await evaluate('!!document.querySelector(".popup-heading")'),false,'Editor gets the available popup space');
 assert.ok(await evaluate('document.querySelector(".rule-form .button").getBoundingClientRect().bottom <= innerHeight+1'),'Editor save action must be visible without scrolling');
 await screenshot('editor');
 await evaluate('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
 await waitFor('!document.querySelector(".rule-form") && document.activeElement.textContent.includes("Add a rule")');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Add a rule")).click()');
 await waitFor('!!document.querySelector(".rule-form")');
 assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false,'Editor must not widen the popup');
 const invalid='valid-first-line\n/('+'x'.repeat(350)+'/';
 // Set through the native input setter so React receives a real input event.
 await evaluate(`(()=>{const input=document.querySelector('.rule-form textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(invalid)});input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.rule-form').requestSubmit()})()`);
 await waitFor('!!document.querySelector("[role=alert]")');
 assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false,'Long validation errors must wrap inside the popup');
 const reachable=await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Manage your rules'));button.scrollIntoView({block:'end'});const box=button.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight+1})()`);
 assert.ok(reachable,'Popup footer remains reachable when the editor/error needs scrolling');
 await screenshot('editor-error');
 assert.match(await evaluate('document.querySelector("[role=alert]").textContent'),/Line 2:/);
 assert.equal(await worker.evaluate(async()=>((await chrome.storage.local.get('storageData')).storageData?.rules||[]).length),0,'Invalid batches cannot partially save valid lines');
 const batch=['spoilers','clickbait','/season \\d+ finale/i'];
 await evaluate(`(()=>{const input=document.querySelector('.rule-form textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(batch.join('\n'))});input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 await evaluate(`(()=>{const select=document.querySelectorAll('.rule-form select')[0];select.value='comment';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 await evaluate(`(()=>{const select=document.querySelectorAll('.rule-form select')[1];select.value='blur';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Save 3 rules"))');
 await evaluate('document.querySelector(".rule-form").requestSubmit()');
 await waitFor('!document.querySelector(".rule-form") && document.querySelector(".popup-count strong").textContent === "3"');
 const persisted=await worker.evaluate(async()=>(await chrome.storage.local.get('storageData')).storageData.rules);
 assert.deepEqual(persisted.map(r=>r.pattern),batch);
 assert.ok(persisted.every(r=>r.field==='comment'&&r.action==='blur'));
 assert.equal(new Set(persisted.map(r=>r.id)).size,3);

 // Verify the related rule badge collision with actual compiled CSS.
 const id=new URL(worker.url()).host;const page=await context.newPage();await page.goto(`chrome-extension://${id}/options.html`);
 await page.evaluate(async()=>{const reply=await chrome.runtime.sendMessage({type:'get'});reply.data.settings.rules=[{id:'badge',field:'title',pattern:'example',action:'blur',enabled:true}];await chrome.runtime.sendMessage({type:'save',data:reply.data.settings})});
 await page.reload();await page.locator('.action-label').waitFor();
 assert.equal(await page.locator('.rule-row .action-label').evaluate(e=>getComputedStyle(e).filter),'none','A blur action label must stay readable');

 await page.getByRole('button',{name:'New rule',exact:true}).click();
 await page.getByLabel('Keyword, ID, or /regex/i').fill('first topic\n\nsecond topic');
 await page.getByRole('button',{name:'Add 2 rules to changes',exact:true}).click();
 assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('storageData')).storageData.rules.length),1,'Settings additions remain staged until Save changes');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.getByRole('button',{name:'Save changes',exact:true}).waitFor({state:'detached'});
 assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('storageData')).storageData.rules.length),3);
 await page.locator('.rule-summary').first().click();
 await page.getByLabel('Keyword, ID, or /regex/i').fill('edited topic\nextra topic');
 await page.getByRole('button',{name:'Add 2 rules to changes',exact:true}).click();
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.getByRole('button',{name:'Save changes',exact:true}).waitFor({state:'detached'});
 const edited=await worker.evaluate(async()=>(await chrome.storage.local.get('storageData')).storageData.rules);
 assert.deepEqual(edited.map(r=>r.pattern),['edited topic','extra topic','first topic','second topic']);
 assert.equal(edited[0].id,'badge');assert.equal(new Set(edited.map(r=>r.id)).size,4);
 // Check keyboard editor dismissal, readable state cues and narrow settings layouts.
 await page.getByRole('button',{name:'New rule',exact:true}).focus();
 await page.keyboard.press('Enter');
 await page.getByLabel('Keyword, ID, or /regex/i').fill('unsaved editor text');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('.rule-form')&&document.activeElement.textContent.includes('New rule'));
 assert.equal(await page.locator('.rule-row').count(),4,'Cancelling an editor cannot stage a rule');
 await page.getByRole('textbox',{name:'Search rules'}).fill('nothing-will-match');
 await page.getByRole('heading',{name:'No matching rules',exact:true}).waitFor();
 await page.getByRole('textbox',{name:'Search rules'}).fill('');
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
 await page.screenshot({path:'artifacts/qa/settings-populated-dark.png',fullPage:true});
 for(const width of [320,390]) {
  await page.setViewportSize({width,height:720});
  for(const name of ['Preferences','Privacy & lock','Your rules']) {
   await page.getByRole('button',{name,exact:true}).click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} must fit ${width}px`);
   await page.screenshot({path:`artifacts/qa/settings-${name.split(' ')[0].toLowerCase()}-${width}.png`,fullPage:true});
  }
 }
 await page.setViewportSize({width:1280,height:900});
 await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});
 await page.getByRole('button',{name:'New rule',exact:true}).click();
 assert.notEqual(await page.locator('.editor-entry').evaluate(e=>getComputedStyle(e).transitionDuration),'0s','Pointer entry retains motion');
 await page.getByRole('button',{name:'Close rule editor'}).click();
 await page.screenshot({path:'artifacts/qa/settings-populated.png',fullPage:true});
 console.log('Native popup layout, mode motion, reduced motion and keyboard focus passed; multiline staging, atomic validation, persistence, and 320/390px settings passed');

} finally {await context.close();await rm(profile,{recursive:true,force:true})}
