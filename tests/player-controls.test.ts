// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installPlayerControls} from '../src/scripts/player-controls';
import type {PageState} from '../src/scripts/page-state';
let state:PageState;
let controller:ReturnType<typeof installPlayerControls>;
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
beforeEach(()=>{
 document.body.innerHTML='';
 state={enabled:true,generation:1,ready:Promise.resolve(),settings:{filterData:{},options:{disable_db_normalize:true,disable_you_there:true}}};
 controller=installPlayerControls(window,state);
});
afterEach(()=>{controller.dispose();vi.restoreAllMocks()});
const changed=()=>window.dispatchEvent(new Event('youblock-settings'));

describe('independent audio configuration controls',()=>{
 it('zeros only existing loudness fields and restores retained objects when disabled',()=>{
  const audio={loudnessDb:-7.5,perceptualLoudnessDb:-5.2,volume:48,muted:true,other:{value:9}};
  const response={playerConfig:{audioConfig:audio},unrelated:{loudnessDb:19,volume:80}};
  controller.transformData(response);
  expect(audio).toEqual({loudnessDb:0,perceptualLoudnessDb:0,volume:48,muted:true,other:{value:9}});
  expect(response.unrelated).toEqual({loudnessDb:19,volume:80});
  state.settings!.options.disable_db_normalize=false;changed();
  expect(audio.loudnessDb).toBe(-7.5);expect(audio.perceptualLoudnessDb).toBe(-5.2);
  state.settings!.options.disable_db_normalize=true;changed();expect(audio.loudnessDb).toBe(0);
  controller.dispose();expect(audio.loudnessDb).toBe(-7.5);
 });
 it('does not invent missing fields or apply the preference while extension is disabled',()=>{
  const audio={loudnessDb:-4,volume:70};
  state.enabled=false;controller.transformData({playerConfig:{audioConfig:audio}});expect(audio.loudnessDb).toBe(-4);
  state.enabled=true;controller.transformData({playerConfig:{audioConfig:audio}});expect(audio).toEqual({loudnessDb:0,volume:70});
  state.enabled=false;changed();expect(audio).toEqual({loudnessDb:-4,volume:70});
 });
 it('handles repeated and cyclic data without overwriting original values',()=>{
  const root:any={audioConfig:{loudnessDb:-8}};root.self=root;
  controller.transformData(root);controller.transformData(root);expect(root.audioConfig.loudnessDb).toBe(0);
  state.settings!.options.disable_db_normalize=false;controller.transformData(root);expect(root.audioConfig.loudnessDb).toBe(-8);
 });
});

describe('independent idle dialog controls',()=>{
 it('accepts an identified idle dialog once and never unrelated confirmations',async()=>{
  document.body.innerHTML='<yt-confirm-dialog-renderer><h2>Video paused. Continue watching?</h2><button>Yes</button></yt-confirm-dialog-renderer><yt-confirm-dialog-renderer><h2>Delete this playlist?</h2><button>Yes</button></yt-confirm-dialog-renderer>';
  const buttons=document.querySelectorAll('button');const idle=vi.fn(),unrelated=vi.fn();buttons[0].addEventListener('click',idle);buttons[1].addEventListener('click',unrelated);
  await turn();changed();await turn();
  expect(idle).toHaveBeenCalledOnce();expect(unrelated).not.toHaveBeenCalled();
 });
 it('leaves idle dialogs alone when the option or extension is disabled',async()=>{
  state.settings!.options.disable_you_there=false;
  document.body.innerHTML='<yt-confirm-dialog-renderer><h2>Are you still watching?</h2><button>Continue</button></yt-confirm-dialog-renderer>';
  const action=vi.fn();document.querySelector('button')!.addEventListener('click',action);await turn();expect(action).not.toHaveBeenCalled();
  state.settings!.options.disable_you_there=true;state.enabled=false;changed();await turn();expect(action).not.toHaveBeenCalled();
  state.enabled=true;changed();await turn();expect(action).toHaveBeenCalledOnce();
 });
 it('ignores hidden or nonaffirmative actions and detaches on disposal',async()=>{
  document.body.innerHTML='<yt-confirm-dialog-renderer hidden><h2>Are you still watching?</h2><button>Yes</button></yt-confirm-dialog-renderer><yt-you-there-renderer><button>No</button></yt-you-there-renderer>';
  const action=vi.fn();document.querySelectorAll('button').forEach(button=>button.addEventListener('click',action));await turn();expect(action).not.toHaveBeenCalled();
  controller.dispose();document.querySelector('yt-confirm-dialog-renderer')!.removeAttribute('hidden');changed();await turn();expect(action).not.toHaveBeenCalled();
 });
});


it('ignores an idle dialog inside a hidden wrapper and accepts it when shown again',async()=>{
 document.body.innerHTML='<div id="popup" style="display:none"><yt-confirm-dialog-renderer><h2>Are you still watching?</h2><button>Yes</button></yt-confirm-dialog-renderer></div>';
 const action=vi.fn();document.querySelector('button')!.addEventListener('click',action);
 await turn();expect(action).not.toHaveBeenCalled();
 (document.querySelector('#popup') as HTMLElement).style.display='block';await turn();expect(action).toHaveBeenCalledOnce();
 (document.querySelector('#popup') as HTMLElement).style.display='none';await turn();
 (document.querySelector('#popup') as HTMLElement).style.display='block';await turn();expect(action).toHaveBeenCalledTimes(2);
});


it('leaves immutable or unknown audio metadata intact without breaking the page',()=>{
 const config=Object.freeze({loudnessDb:-6,perceptualLoudnessDb:-3});
 expect(()=>controller.transformData({playerConfig:{audioConfig:config}})).not.toThrow();
 expect(config.loudnessDb).toBe(-6);
 const unknown={loudnessDb:'future-format',perceptualLoudnessDb:null};controller.transformData({playerConfig:{audioConfig:unknown}});expect(unknown).toEqual({loudnessDb:'future-format',perceptualLoudnessDb:null});
});
