import type { PageSettings } from "../scripts/page-state";

export function decideAction(settings: PageSettings|undefined, meta: Record<string,string>, comment: boolean): 'hide'|'blur'|undefined {
  if (!settings) return;
  let result: 'hide'|'blur'|undefined;
  for (const field of ['title','channelName','channelId','videoId','comment']) {
    if ((comment && (field === 'title'||field==='videoId')) || (!comment && field==='comment')) continue;
    const entries = settings.filterData[field];
    if (!Array.isArray(entries) || !meta[field]) continue;
    for (const entry of entries) {
      // Invalid user expressions must never disable other valid rules.
      try {
        const expression = entry instanceof RegExp ? entry : new RegExp(entry[0],String(entry[1]||'').replace(/[gy]/g,''));
        expression.lastIndex=0;
        if (expression.test(meta[field])) {
          const action = (entry instanceof RegExp ? (entry as any).youblockAction : entry[2]) || settings.options.youblock_mode || 'hide';
          if (action==='hide') return 'hide';
          result='blur';
        }
      } catch { /* Ignore malformed entry; the settings manager reports validation errors. */ }
    }
  }
  return result;
}
