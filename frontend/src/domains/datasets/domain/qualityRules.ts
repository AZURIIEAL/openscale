import type { DatasetColumn, QualityRule, RuleStat, RuleTier } from './entities';

/** The tiers in the order the editor offers them, with what each does. */
export const RULE_TIERS: { value: RuleTier; label: string; description: string }[] = [
  { value: 'reject', label: 'Reject', description: 'Drop the row and count it as rejected.' },
  { value: 'quarantine', label: 'Quarantine', description: "Drop the row and keep it in this rule's quarantine file." },
  { value: 'flag', label: 'Flag', description: 'Keep the row; a true/false column records whether the rule hit.' },
  { value: 'monitor', label: 'Monitor', description: 'Change nothing; only count the rows that match.' },
];

export function tierTone(tier: RuleTier): 'danger' | 'warning' | 'info' | 'neutral' {
  switch (tier) {
    case 'reject':
      return 'danger';
    case 'quarantine':
      return 'warning';
    case 'flag':
      return 'info';
    default:
      return 'neutral';
  }
}

// Mirrors control-plane/internal/datasets/rules.go.
export const MAX_RULES = 200;
export const MAX_RULE_WHEN = 4000;
const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** The column a flag rule adds: its own `column`, else flag_<id>. */
export function flagColumn(rule: Pick<QualityRule, 'id' | 'column'>): string {
  const own = rule.column?.trim();
  return own ? own : `flag_${rule.id.trim().replace(/[^A-Za-z0-9_]/g, '_').toLowerCase()}`;
}

/**
 * What the server would refuse, by rule index, plus list-level problems
 * under -1. Same checks as datasets.ParseRules; whether a condition is
 * valid SQL is only known once the server checks it against the data.
 */
export function ruleErrors(rules: QualityRule[], columns: DatasetColumn[]): Record<number, string> {
  const errors: Record<number, string> = {};
  if (rules.length > MAX_RULES) errors[-1] = `At most ${MAX_RULES} rules per dataset.`;
  const existing = new Set(columns.map((c) => c.name.toLowerCase()));
  const ids = new Set<string>();
  const flags = new Set<string>();
  rules.forEach((rule, i) => {
    const id = rule.id.trim();
    let error: string | null = null;
    if (!RULE_ID.test(id)) error = "Id: letters, digits, '.', '_' or '-' (up to 64).";
    else if (ids.has(id)) error = `Another rule already uses the id ${id}.`;
    else if (rule.when.trim() === '') error = 'Write the condition that marks a bad row.';
    else if (rule.when.trim().length > MAX_RULE_WHEN) error = `The condition is longer than ${MAX_RULE_WHEN} characters.`;
    else if (rule.tier === 'flag') {
      const col = flagColumn(rule);
      const key = col.toLowerCase();
      if (!IDENT.test(col)) error = 'Flag column: letters, digits and underscores, starting with a letter.';
      else if (existing.has(key)) error = `The dataset already has a column named ${col}.`;
      else if (flags.has(key)) error = `Another flag rule already writes ${col}.`;
      flags.add(key);
    }
    ids.add(id);
    if (error) errors[i] = error;
  });
  return errors;
}

/** Trims fields and drops what the server doesn't store (blank notes, a
 * column on a non-flag rule), so saved and edited lists compare equal. */
export function normalizeRules(rules: QualityRule[]): QualityRule[] {
  return rules.map((r) => {
    const out: QualityRule = { id: r.id.trim(), tier: r.tier, when: r.when.trim() };
    const note = r.note?.trim();
    if (note) out.note = note;
    const column = r.column?.trim();
    if (r.tier === 'flag' && column) out.column = column;
    return out;
  });
}

export function sameRules(a: QualityRule[], b: QualityRule[]): boolean {
  return JSON.stringify(normalizeRules(a)) === JSON.stringify(normalizeRules(b));
}

/** rule_1, rule_2, ...: the first id not taken. */
export function nextRuleId(rules: QualityRule[]): string {
  const taken = new Set(rules.map((r) => r.id.trim()));
  let n = rules.length + 1;
  while (taken.has(`rule_${n}`)) n++;
  return `rule_${n}`;
}

/** Moves rule i one place up (-1) or down (+1); out of range is a no-op. */
export function moveRule(rules: QualityRule[], i: number, by: -1 | 1): QualityRule[] {
  const j = i + by;
  if (i < 0 || i >= rules.length || j < 0 || j >= rules.length) return rules;
  const next = [...rules];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** One line under a rule after a test, e.g. "12 match · 9 removed". */
export function describeStat(stat: RuleStat): string {
  const match = `${stat.hits.toLocaleString()} match${stat.hits === 1 ? '' : 'es'}`;
  if (stat.assigned !== null) {
    const shadowed = stat.hits - stat.assigned;
    return `${match} · ${stat.assigned.toLocaleString()} removed${shadowed > 0 ? ` (${shadowed.toLocaleString()} already removed by earlier rules)` : ''}`;
  }
  if (stat.flagged !== null) return `${match} · ${stat.flagged.toLocaleString()} kept rows flagged`;
  return match;
}
