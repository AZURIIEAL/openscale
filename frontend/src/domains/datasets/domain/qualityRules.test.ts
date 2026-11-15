import { describe, expect, it } from 'vitest';
import { describeStat, flagColumn, moveRule, nextRuleId, normalizeRules, ruleErrors, sameRules } from './qualityRules';
import type { QualityRule } from './entities';

const cols = [
  { name: 'fare', type: 'DOUBLE' },
  { name: 'Pickup', type: 'TIMESTAMP' },
];
const r = (over: Partial<QualityRule> = {}): QualityRule => ({ id: 'a', tier: 'reject', when: 'fare < 0', ...over });

describe('ruleErrors', () => {
  it('accepts a valid list', () => {
    expect(ruleErrors([r(), r({ id: 'b', tier: 'flag', when: 'fare > 100' }), r({ id: 'c', tier: 'monitor', when: 'fare IS NULL' })], cols)).toEqual({});
  });

  it.each([
    [[r({ id: '-x' })], 0, 'Id'],
    [[r({ id: '  ' })], 0, 'Id'],
    [[r(), r()], 1, 'already uses'],
    [[r({ when: '  ' })], 0, 'condition'],
    [[r({ when: 'x'.repeat(4001) })], 0, 'longer than'],
    [[r({ tier: 'flag', column: 'bad name' })], 0, 'Flag column'],
    [[r({ tier: 'flag', column: 'FARE' })], 0, 'already has a column'],
    [[r({ id: 'x', tier: 'flag' }), r({ id: 'y', tier: 'flag', column: 'flag_x' })], 1, 'already writes'],
  ])('flags %j at index %i', (rules, index, text) => {
    expect(ruleErrors(rules as QualityRule[], cols)[index as number]).toContain(text);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 201 }, (_, i) => r({ id: `r${i}` }));
    expect(ruleErrors(many, cols)[-1]).toContain('At most');
  });
});

describe('flagColumn', () => {
  it('defaults from the id like the server', () => {
    expect(flagColumn({ id: 'SLV-008' })).toBe('flag_slv_008');
    expect(flagColumn({ id: 'x', column: ' custom ' })).toBe('custom');
  });
});

describe('normalizeRules / sameRules', () => {
  it('trims, drops blank notes and stray columns', () => {
    expect(normalizeRules([r({ id: ' a ', when: ' x ', note: '  ', column: 'c' })])).toEqual([{ id: 'a', tier: 'reject', when: 'x' }]);
    expect(normalizeRules([r({ tier: 'flag', column: ' c ', note: ' n ' })])).toEqual([{ id: 'a', tier: 'flag', when: 'fare < 0', note: 'n', column: 'c' }]);
  });

  it('compares lists after normalizing, order included', () => {
    expect(sameRules([r({ when: ' fare < 0 ' })], [r()])).toBe(true);
    expect(sameRules([r(), r({ id: 'b' })], [r({ id: 'b' }), r()])).toBe(false);
  });
});

describe('nextRuleId / moveRule', () => {
  it('picks the first free id', () => {
    expect(nextRuleId([])).toBe('rule_1');
    expect(nextRuleId([r({ id: 'rule_2' })])).toBe('rule_3');
  });

  it('moves within bounds only', () => {
    const list = [r({ id: 'a' }), r({ id: 'b' }), r({ id: 'c' })];
    expect(moveRule(list, 2, -1).map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(moveRule(list, 0, -1)).toBe(list);
    expect(moveRule(list, 2, 1)).toBe(list);
  });
});

describe('describeStat', () => {
  it('explains removed, shadowed, flagged and monitored rows', () => {
    expect(describeStat({ id: 'a', tier: 'reject', note: '', hits: 1, assigned: 1, flagged: null })).toBe('1 match · 1 removed');
    expect(describeStat({ id: 'a', tier: 'quarantine', note: '', hits: 5, assigned: 3, flagged: null })).toBe('5 matches · 3 removed (2 already removed by earlier rules)');
    expect(describeStat({ id: 'a', tier: 'flag', note: '', hits: 4, assigned: null, flagged: 2 })).toBe('4 matches · 2 kept rows flagged');
    expect(describeStat({ id: 'a', tier: 'monitor', note: '', hits: 0, assigned: null, flagged: null })).toBe('0 matches');
  });
});
