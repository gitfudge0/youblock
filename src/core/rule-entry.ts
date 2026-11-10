import {validateRule, type Rule} from './model';

/** Parse the complete batch before the caller changes any saved or draft rules. */
export function parseRuleEntries(text: string, template: Rule): Rule[] {
  const entries = text.split(/\r\n|\r|\n/)
    .map((pattern, index) => ({pattern: pattern.trim(), line: index + 1}))
    .filter(entry => entry.pattern.length > 0);
  if (!entries.length) throw new Error('Enter at least one rule. Blank lines are ignored.');
  const errors: string[] = [];
  for (const entry of entries) {
    try {
      if (entry.pattern.length > 5000) throw new Error('Use at most 5,000 characters per rule.');
      validateRule({...template, pattern: entry.pattern});
    } catch (error) {
      errors.push(`Line ${entry.line}: ${error instanceof Error ? error.message : 'Invalid rule'}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return entries.map((entry, index) => ({
    ...template,
    id: index === 0 ? template.id : crypto.randomUUID(),
    pattern: entry.pattern,
  }));
}
