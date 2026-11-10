export type Field = 'title' | 'channelName' | 'channelId' | 'videoId' | 'comment';
export type Action = 'inherit' | 'hide' | 'blur';
export interface Rule { id: string; field: Field; pattern: string; action: Action; enabled: boolean }
export interface Settings {
 schemaVersion: 1; mode: 'hide' | 'blur'; rules: Rule[];
 filterData: Record<Field, string[]> & {vidLength: [number|null,number|null]; javascript:string};
 options: Record<string, boolean|string|number|null>;
}
export interface State { settings: Settings; enabled: boolean; locked: boolean; protected: boolean }
export const fields: Field[] = ['title','channelName','channelId','videoId','comment'];
export const optionLabels: Record<string,string> = {
 trending:'Hide Explore & Trending', mixes:'Block YouTube Mixes', shorts:'Block Shorts', movies:'Block movies', suggestions_only:'Only filter recommendations', autoplay:'Skip blocked videos in autoplay', block_feedback:'Send “Not interested” feedback to YouTube', disable_db_normalize:'Disable audio normalization', disable_you_there:'Disable “Are you still watching?”', disable_on_history:'Allow videos in watch history', enable_javascript:'Enable custom JavaScript filter'
};
export function defaults():Settings {return {schemaVersion:1,mode:'hide',rules:[],filterData:{title:[],channelName:[],channelId:[],videoId:[],comment:[],vidLength:[null,null],javascript:''},options:{...Object.fromEntries(Object.keys(optionLabels).map(k=>[k,false])),block_message:'Filtered by YouBlock',vidLength_type:'allow',percent_watched_hide:null}}}
export function regex(pattern:string,field:Field):RegExp {
 if(field==='videoId'||field==='channelId')return new RegExp('^'+pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
 const raw=/^\/(.*)\/([a-z]*)$/.exec(pattern);
 if(raw)return new RegExp(raw[1],raw[2].replace(/[gy]/g,''));
 const literal=pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 // Unicode letters, numbers and combining marks define words; punctuation separates them.
 const separator='[^\\p{L}\\p{N}\\p{M}]';
 return new RegExp(`(?:^|${separator})${literal}(?=$|${separator})`,'iu');
}
export function validateRule(rule:Rule) {if(!fields.includes(rule.field)||!['inherit','hide','blur'].includes(rule.action)||typeof rule.enabled!=='boolean'||typeof rule.id!=='string'||!rule.pattern?.trim())throw new Error('Invalid or empty rule');regex(rule.pattern,rule.field)}
export function normalize(input:unknown, recoverSavedRules=false):Settings {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a YouBlock backup object');
 const raw=input as Record<string,any>; const data=raw.storageData||raw;
 if(!data.filterData||!data.options)throw new Error('Backup must contain filterData and options');
 if(data.schemaVersion && data.schemaVersion!==1)throw new Error('Unsupported backup version');
 const s=defaults();s.mode=data.mode==='blur'?'blur':'hide';
 for(const f of fields){if(data.filterData[f]!==undefined&&!Array.isArray(data.filterData[f]))throw new Error('Invalid '+f+' list');s.filterData[f]=(data.filterData[f]||[]).map((v:unknown)=>{if(typeof v!=='string')throw new Error('Rules must be text');if(v.trim()&&!v.startsWith('//')&&!recoverSavedRules)regex(v,f);return v})}
 s.rules=(data.rules||[]).map((r:Rule)=>{if(recoverSavedRules){validateRule({...r,pattern:'recovery'});if(typeof r.pattern!=='string'||!r.pattern.trim())throw new Error('Invalid saved rule structure')}else validateRule(r);return {...r}});
 if(s.rules.length>10000)throw new Error('Too many rules');
 for(const k of Object.keys(s.options)){const v=data.options[k];if(v!==undefined){if(typeof s.options[k]==='boolean'&&typeof v!=='boolean')throw new Error('Invalid option '+k);s.options[k]=v}}
 const len=data.filterData.vidLength||[null,null];
 if(!Array.isArray(len)||len.length!==2||len.some((n:unknown)=>n!==null&&(!Number.isFinite(n)||Number(n)<0)))throw new Error('Invalid duration range');
 if(len[0]!==null&&len[1]!==null&&len[0]>len[1])throw new Error('Minimum duration cannot exceed maximum');
 s.filterData.vidLength=[...len] as [number|null,number|null];
 s.filterData.javascript=typeof data.filterData.javascript==='string'?data.filterData.javascript:'';
 const percent=s.options.percent_watched_hide;if(percent!==null&&(!Number.isFinite(percent)||Number(percent)<0||Number(percent)>100))throw new Error('Watched percentage must be 0–100');
 if(!['allow','block'].includes(String(s.options.vidLength_type)))throw new Error('Invalid duration mode');
 return s;
}
export function allRules(s:Settings):Rule[]{return [...s.rules,...fields.flatMap(f=>s.filterData[f].filter(p=>p.trim()&&!p.startsWith('//')).map((pattern,i)=>({id:`legacy-${f}-${i}`,field:f,pattern,action:'inherit' as Action,enabled:true}))) ]}
export function compile(s:Settings){
 const filterData:any={vidLength:s.filterData.vidLength,javascript:s.filterData.javascript};
 for(const f of fields)filterData[f]=allRules(s).filter(r=>r.enabled&&r.field===f).map(r=>{try{const re=regex(r.pattern,f);return [re.source,re.flags,r.action==='inherit'?s.mode:r.action]}catch{return null}}).filter(Boolean);
 return {filterData,options:{...s.options,youblock_mode:s.mode}};
}
