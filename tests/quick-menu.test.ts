// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {installQuickMenu} from '../src/scripts/quick-menu';
import type {PageState} from '../src/scripts/page-state';
let state:PageState,controller:ReturnType<typeof installQuickMenu>;
let host:HTMLElement,endpoint:any,feedback:ReturnType<typeof vi.fn>,posted:ReturnType<typeof vi.spyOn>;
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
function open(){const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:100});host.querySelector('h3')!.dispatchEvent(event);return event}
function blockVideo(){const item=document.querySelector<HTMLButtonElement>('[role="menuitem"]')!;item.click();return posted.mock.calls.find(([message]:any)=>message.type==='contextBlockData')![0] as any}
function acknowledge(id:string,from='YOUBLOCK_CONTENT',source:MessageEventSource|null=window,origin=location.origin){window.dispatchEvent(new MessageEvent('message',{source,origin,data:{from,type:'contextBlockConfirmed',data:{requestId:id}}}))}
beforeEach(()=>{
 document.body.innerHTML='<ytd-video-renderer><a href="/watch?v=exact-video"><h3>Exact video title</h3></a><a href="/channel/UC-exact">Exact creator</a><ytd-menu-renderer></ytd-menu-renderer></ytd-video-renderer>';
 host=document.querySelector('ytd-video-renderer')!;
 endpoint={clickTrackingParams:'local-test',feedbackEndpoint:{feedbackToken:'local-feedback-token'}};
 (host as any).data={videoId:'exact-video',title:{simpleText:'Exact video title'},menu:{menuRenderer:{items:[{menuServiceItemRenderer:{text:{runs:[{text:'Not interested'}]},icon:{iconType:'NOT_INTERESTED'},serviceEndpoint:endpoint}}]}}};
 state={enabled:true,generation:1,ready:Promise.resolve(),settings:{filterData:{},options:{block_feedback:true}}};
 posted=vi.spyOn(window,'postMessage').mockImplementation(()=>{});feedback=vi.fn();host.addEventListener('yt-service-request',feedback);
 controller=installQuickMenu(window,state);
});
afterEach(()=>{controller.dispose();document.body.innerHTML='';vi.restoreAllMocks();vi.useRealTimers()});

describe('independent quick-block controls',()=>{
 it('requests exact video and channel rules without native dismissal or feedback before confirmation',()=>{
  const event=open();expect(event.defaultPrevented).toBe(true);
  const request=blockVideo();expect(request.from).toBe('YOUBLOCK_PAGE');expect(request.data).toMatchObject({type:'videoId',info:{id:'exact-video',text:'Exact video title'}});expect(typeof request.data.requestId).toBe('string');
  expect(feedback).not.toHaveBeenCalled();expect(host.isConnected).toBe(true);
  open();const channel=document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1];channel.click();
  expect(posted.mock.calls.at(-1)?.[0]).toMatchObject({data:{type:'channelId',info:{id:'UC-exact',text:'Exact creator'}}});
 });
 it('dispatches the unchanged native feedback endpoint once only after a valid acknowledgment',()=>{
  open();const request=blockVideo();
  acknowledge(request.data.requestId,'untrusted');acknowledge(request.data.requestId,'YOUBLOCK_CONTENT',null);acknowledge(request.data.requestId,'YOUBLOCK_CONTENT',window,'https://example.invalid');
  expect(feedback).not.toHaveBeenCalled();
  acknowledge(request.data.requestId);expect(feedback).toHaveBeenCalledTimes(1);
  const event=feedback.mock.calls[0][0] as CustomEvent;expect(event.detail.endpoint).toBe(endpoint);expect(event.bubbles).toBe(true);expect(event.composed).toBe(true);
  acknowledge(request.data.requestId);expect(feedback).toHaveBeenCalledTimes(1);
  expect((host as any).data.menu.menuRenderer.items[0].menuServiceItemRenderer.serviceEndpoint).toBe(endpoint);
 });
 it('does not send optional feedback when disabled, canceled, expired, or the card has been recycled',async()=>{
  state.settings!.options.block_feedback=false;open();let request=blockVideo();acknowledge(request.data.requestId);expect(feedback).not.toHaveBeenCalled();
  state.settings!.options.block_feedback=true;open();request=blockVideo();expect(feedback).not.toHaveBeenCalled(); // A canceled confirmation has no acknowledgement.
  vi.useFakeTimers();open();const expired=blockVideo();await vi.advanceTimersByTimeAsync(30001);acknowledge(expired.data.requestId);expect(feedback).not.toHaveBeenCalled();
  open();request=blockVideo();host.querySelector('a')!.href='/watch?v=recycled';acknowledge(request.data.requestId);expect(feedback).not.toHaveBeenCalled();
 });
 it('offers a keyboard/touch affordance beside the original menu and restores focus after Escape',async()=>{
  await turn();const native=host.querySelector('ytd-menu-renderer')!;
  const trigger=host.querySelector<HTMLButtonElement>('[data-youblock-action-trigger]')!;expect(trigger).not.toBeNull();expect(native.nextElementSibling).toBe(trigger);
  trigger.focus();trigger.click();expect(document.activeElement?.textContent).toBe('Block this video');
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));expect(document.activeElement?.textContent).toBe('Block this channel');
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  expect(document.querySelector('[role="menu"]')).toBeNull();expect(document.activeElement).toBe(trigger);expect(native.isConnected).toBe(true);
 });
 it('disables unavailable channel IDs instead of guessing from a handle',()=>{
  host.querySelector('a[href*="/channel/"]')!.setAttribute('href','/@creator');open();
  const channel=document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1];expect(channel.disabled).toBe(true);channel.click();expect(posted).not.toHaveBeenCalled();
 });
 it('leaves unrelated links and disabled filtering untouched',()=>{
  const link=document.createElement('a');link.href='/feed/subscriptions';document.body.append(link);
  const unrelated=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});link.dispatchEvent(unrelated);expect(unrelated.defaultPrevented).toBe(false);
  state.enabled=false;expect(open().defaultPrevented).toBe(false);expect(document.querySelector('[role="menu"]')).toBeNull();
 });
 it('does not select a different feedback action just because it has a feedback endpoint',()=>{
  (host as any).data.menu.menuRenderer.items[0].menuServiceItemRenderer={text:{simpleText:"Don't recommend channel"},icon:{iconType:'REMOVE'},serviceEndpoint:endpoint};
  open();const request=blockVideo();acknowledge(request.data.requestId);expect(feedback).not.toHaveBeenCalled();
 });
 it('does not duplicate affordances after unrelated DOM mutations and cleans up on dispose',async()=>{
  await turn();host.append(document.createElement('span'));await turn();expect(host.querySelectorAll('[data-youblock-action-trigger]')).toHaveLength(1);
  open();controller.dispose();expect(document.querySelector('[role="menu"]')).toBeNull();expect(document.querySelector('[data-youblock-action-trigger]')).toBeNull();expect(document.querySelector('[data-youblock-quick-style]')).toBeNull();
 });
});
