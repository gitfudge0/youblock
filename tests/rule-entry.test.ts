import {describe,it,expect} from 'vitest';
import {parseRuleEntries} from '../src/core/rule-entry';
import {type Rule,compile,defaults} from '../src/core/model';
const template:Rule={id:'existing',field:'title',pattern:'',action:'blur',enabled:true};
describe('one filter rule per line',()=>{
 it('handles pasted CRLF/CR/LF, trims outside whitespace, and ignores blank lines',()=>{
  const rules=parseRuleEntries(' spoilers \r\n\r\nclick bait\r /season \\d+ finale/i \n',template);
  expect(rules.map(r=>r.pattern)).toEqual(['spoilers','click bait','/season \\d+ finale/i']);
  expect(rules.every(r=>r.field==='title'&&r.action==='blur'&&r.enabled)).toBe(true);
  expect(rules[0].id).toBe('existing');expect(new Set(rules.map(r=>r.id)).size).toBe(3);
  const s=defaults();s.rules=rules;expect(compile(s).filterData.title).toHaveLength(3);
 });
 it('reports original invalid line numbers and leaves the template untouched',()=>{
  const before=structuredClone(template);
  expect(()=>parseRuleEntries('good\n\n/[/\nmore good\n/(/',template)).toThrow(/Line 3:.*\nLine 5:/);
  expect(template).toEqual(before);
 });
 it('rejects whitespace-only batches and oversized individual rules',()=>{
  expect(()=>parseRuleEntries(' \r\n\t\n',template)).toThrow(/at least one/);
  expect(()=>parseRuleEntries('okay\n'+'x'.repeat(5001),template)).toThrow(/Line 2: Use at most/);
 });
 it('preserves exact IDs and the selected disabled state without treating them as regex',()=>{
  const rules=parseRuleEntries('UC.first\nUC.second',{...template,field:'channelId',enabled:false});
  expect(rules.map(r=>r.pattern)).toEqual(['UC.first','UC.second']);expect(rules.every(r=>!r.enabled)).toBe(true);
 });
 it('keeps an escaped newline in a regex on the same rule line',()=>{
  const rules=parseRuleEntries('/hello\\nworld/i\nother',template);expect(rules).toHaveLength(2);expect(rules[0].pattern).toBe('/hello\\nworld/i');
 });
});
