import {describe,it,expect} from 'vitest';
import {defaults,normalize,compile,regex} from '../src/core/model';
describe('YouBlock rule compiler',()=>{
 it('matches whole keywords case-insensitively without matching substrings',()=>{const re=regex('cat','title');expect(re.test('A CAT video')).toBe(true);expect(re.test('catching')).toBe(false)});
 it('treats exact IDs literally and keeps name and channel identity separate',()=>{expect(regex('UC.test','channelId').test('UCxtest')).toBe(false);expect(regex('UC.test','channelId').test('UC.test')).toBe(true)});
 it('supports raw regex without stateful flags',()=>{const re=regex('/cat/gi','title');expect(re.test('cat')).toBe(true);expect(re.test('cat')).toBe(true)});
 it('isolates a damaged saved rule during compilation',()=>{const s=defaults();s.rules=[{id:'a',field:'title',pattern:'/[/i',enabled:true,action:'hide'},{id:'b',field:'title',pattern:'safe',enabled:true,action:'blur'}];expect(compile(s).filterData.title).toHaveLength(1)});
 it('preserves per-rule actions and ignores disabled rules',()=>{const s=defaults();s.mode='blur';s.rules=[{id:'a',field:'title',pattern:'cat',enabled:true,action:'inherit'},{id:'b',field:'title',pattern:'dog',enabled:true,action:'hide'},{id:'c',field:'title',pattern:'fish',enabled:false,action:'hide'}];expect(compile(s).filterData.title.map((x:any)=>x[2])).toEqual(['blur','hide'])});
 it('imports legacy list backups without plaintext passwords',()=>{const s=normalize({filterData:{title:['// notes','cat'],vidLength:[30,600]},options:{shorts:true},uiPass:'old'});expect(s.options.shorts).toBe(true);expect(compile(s).filterData.title).toHaveLength(1);expect(s).not.toHaveProperty('uiPass');expect(s.filterData.vidLength).toEqual([30,600])});
 it('rejects malformed and future imports',()=>{expect(()=>normalize({})).toThrow();expect(()=>normalize({...defaults(),schemaVersion:9})).toThrow();const s=defaults();s.filterData.title=['/[/'];expect(()=>normalize(s)).toThrow()});
 it('rejects invalid numeric ranges',()=>{const s=defaults();s.filterData.vidLength=[-1,null];expect(()=>normalize(s)).toThrow();s.filterData.vidLength=[null,null];s.options.percent_watched_hide=101;expect(()=>normalize(s)).toThrow()});
});
