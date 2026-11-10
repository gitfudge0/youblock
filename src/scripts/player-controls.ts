import type { PageState } from './page-state';

type ObjectRecord = Record<string, unknown>;
const object = (value: unknown): value is ObjectRecord => value !== null && typeof value === 'object';
const audioFields = ['loudnessDb', 'perceptualLoudnessDb'] as const;
type AudioField = typeof audioFields[number];
type OriginalAudio = Partial<Record<AudioField, unknown>>;

/** Applies only user-selected playback preferences; it never changes volume or mute. */
export function installPlayerControls(win: Window & typeof globalThis, state: PageState) {
  const doc = win.document;
  const originals = new WeakMap<object, OriginalAudio>();
  const retained = new Set<WeakRef<ObjectRecord>>();
  const tracked = new WeakSet<object>();
  const dialogAttempts = new WeakMap<Element, string>();
  let disposed = false;
  let scanQueued = false;

  function updateAudio(config: ObjectRecord) {
    const disable = state.enabled && state.settings?.options.disable_db_normalize === true;
    let saved = originals.get(config);
    if (disable) {
      if (!saved) {
        saved = {};
        for (const field of audioFields) {
          if (typeof config[field] === 'number' && Number.isFinite(config[field])) saved[field] = config[field];
        }
        if (!Object.keys(saved).length) return;
        originals.set(config, saved);
        if (!tracked.has(config)) { tracked.add(config); retained.add(new WeakRef(config)); }
      }
      for (const field of audioFields) {
        if (Object.prototype.hasOwnProperty.call(saved, field)) { try { config[field] = 0; } catch { /* Read-only metadata is left intact. */ } }
      }
    } else if (saved) {
      for (const field of audioFields) {
        if (Object.prototype.hasOwnProperty.call(saved, field)) { try { config[field] = saved[field]; } catch { /* Read-only metadata is left intact. */ } }
      }
      originals.delete(config);
    }
  }

  function transformData(root: unknown) {
    if (disposed || !object(root)) return;
    const visited = new WeakSet<object>();
    const pending: unknown[] = [root];
    let budget = 20000;
    while (pending.length && budget-- > 0) {
      const item = pending.pop();
      if (!object(item) || visited.has(item)) continue;
      visited.add(item);
      // The key identifies YouTube's response audio configuration, not generic
      // application objects containing similarly named volume properties.
      if (object(item.audioConfig)) updateAudio(item.audioConfig);
      for (const value of Object.values(item)) if (object(value)) pending.push(value);
    }
  }

  function visible(element: HTMLElement) {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true' || element.closest('[hidden],[aria-hidden="true"]')) return false;
    for (let parent:HTMLElement|null = element; parent; parent = parent.parentElement) {
      const css = win.getComputedStyle(parent);
      if (css.display === 'none' || css.visibility === 'hidden') return false;
    }
    return true;
  }

  function scanDialogs() {
    scanQueued = false;
    if (disposed) return;
    const dialogs = doc.querySelectorAll<HTMLElement>('yt-confirm-dialog-renderer,ytm-confirm-dialog-renderer,yt-you-there-renderer,ytm-you-there-renderer');
    for (const dialog of dialogs) {
      if (!visible(dialog)) { dialogAttempts.delete(dialog); continue; }
      if (!state.enabled || state.settings?.options.disable_you_there !== true) continue;
      const data = (dialog as HTMLElement & {data?:ObjectRecord}).data;
      const text = (dialog.textContent || '').replace(/\s+/g, ' ').trim();
      const explicitIdle = /you-there-renderer$/.test(dialog.localName) || data?.dialogType === 'YOU_THERE' || data?.dialogType === 'CONTINUE_WATCHING';
      const identifiedIdle = /(?:are you )?still watching\??|video paused[.!]?\s*(?:continue watching)|continue watching\?/i.test(text);
      if (!explicitIdle && !identifiedIdle) continue;
      // A title and affirmative action are both required. Unrelated confirmation
      // dialogs and purchase/leave prompts are never auto-accepted.
      const candidates = [...dialog.querySelectorAll<HTMLElement>('button,[role="button"]')];
      const affirmative = candidates.find(button => {
        const caption = (button.getAttribute('aria-label') || button.textContent || '').trim();
        return /^(?:yes|continue|continue watching|keep watching|resume)(?:[.!])?$/i.test(caption) &&
          !(button as HTMLButtonElement).disabled && button.getAttribute('aria-disabled') !== 'true' && visible(button);
      });
      if (!affirmative) continue;
      const fingerprint = text + '\n' + affirmative.textContent;
      if (dialogAttempts.get(dialog) === fingerprint) continue;
      dialogAttempts.set(dialog, fingerprint);
      affirmative.click();
    }
  }

  function queueDialogs() {
    if (disposed || scanQueued) return;
    scanQueued = true;
    win.queueMicrotask(scanDialogs);
  }

  function preferencesChanged() {
    for (const reference of retained) {
      const config = reference.deref();
      if (!config) retained.delete(reference);
      else updateAudio(config);
    }
    queueDialogs();
  }

  const observer = new win.MutationObserver(queueDialogs);
  observer.observe(doc, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['hidden','aria-hidden','style','disabled','aria-disabled']});
  win.addEventListener('youblock-settings', preferencesChanged);
  doc.addEventListener('yt-navigate-finish', preferencesChanged);
  queueDialogs();
  return {
    transformData,
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      win.removeEventListener('youblock-settings', preferencesChanged);
      doc.removeEventListener('yt-navigate-finish', preferencesChanged);
      // Restoration is independent of the current checkbox/enable state.
      for (const reference of retained) {
        const config = reference.deref();
        const saved = config && originals.get(config);
        if (config && saved) {
          for (const field of audioFields) if (Object.prototype.hasOwnProperty.call(saved, field)) { try { config[field] = saved[field]; } catch { /* Read-only metadata is left intact. */ } }
          originals.delete(config);
        }
      }
      retained.clear();
    },
  };
}
