import { useMemo, useState } from 'react';
import { Badge } from '@/shared/design-system/Badge';
import { Spinner } from '@/shared/design-system/Spinner';
import { Well } from '@/shared/design-system/Well';
import { useSaveRules, useTestRules } from '../application/useDatasets';
import type { Dataset, QualityRule, RuleStat, RulesTestResult } from '../domain/entities';
import { RULE_TIERS, describeStat, flagColumn, moveRule, nextRuleId, normalizeRules, ruleErrors, sameRules, tierTone } from '../domain/qualityRules';
import { ActionButton } from './ActionButton';

const inputClass = 'os-well os-font-mono rounded-lg px-2.5 py-1.5 text-[12.5px]';
const inputStyle = { background: 'transparent', border: 'none', color: 'var(--text-body)', outline: 'none' } as const;

/**
 * The dataset's quality rules as an editable list. Order is priority: a row
 * removed by one rule is not removed again by a later one. Save checks every
 * condition against the data on the server; Test counts what a validate run
 * would keep, remove and flag, per rule, without writing anything.
 */
export function RulesEditor({ dataset }: { dataset: Dataset }) {
  const [draft, setDraftState] = useState<QualityRule[]>(dataset.rules);
  const [tested, setTested] = useState<{ rules: QualityRule[]; result: RulesTestResult } | null>(null);
  const save = useSaveRules();
  const test = useTestRules();

  const errors = useMemo(() => ruleErrors(draft, dataset.columns), [draft, dataset.columns]);
  const valid = Object.keys(errors).length === 0;
  const dirty = !sameRules(draft, dataset.rules);
  const ready = dataset.status === 'ready';
  // A test describes the rules it ran; once they change it no longer applies.
  const current = tested && sameRules(tested.rules, draft) ? tested.result : null;
  const stats = new Map<string, RuleStat>((current?.rules ?? []).map((s) => [s.id, s]));

  // An edit makes the last save's outcome (error or "Saved") out of date.
  const setDraft = (next: QualityRule[] | ((rules: QualityRule[]) => QualityRule[])) => {
    if (!save.isIdle) save.reset();
    setDraftState(next);
  };
  const update = (i: number, patch: Partial<QualityRule>) => setDraft((rules) => rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function onTest() {
    const rules = normalizeRules(draft);
    test.mutate({ name: dataset.name, rules }, { onSuccess: (result) => setTested({ rules, result }) });
  }

  function onSave() {
    save.mutate({ name: dataset.name, rules: normalizeRules(draft) }, { onSuccess: (saved) => setDraftState(saved.rules) });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Rules run in order when you validate this dataset. Each condition is SQL over the columns below; a row removed by one rule isn't
        removed again by a later one.
      </p>
      {dataset.columns.length > 0 && (
        <p className="os-font-mono m-0 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          {dataset.columns.map((c) => c.name).join(' · ')}
        </p>
      )}

      {draft.length === 0 && (
        <Well className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          No rules yet. Add one, e.g. reject rows where <span className="os-font-mono">amount &lt; 0</span>.
        </Well>
      )}

      {draft.map((rule, i) => (
        <RuleCard
          key={i}
          index={i}
          count={draft.length}
          rule={rule}
          error={errors[i]}
          stat={stats.get(rule.id.trim())}
          onChange={(patch) => update(i, patch)}
          onMove={(by) => setDraft((rules) => moveRule(rules, i, by))}
          onRemove={() => setDraft((rules) => rules.filter((_, j) => j !== i))}
        />
      ))}
      {errors[-1] && <ErrorText text={errors[-1]} />}

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={() => setDraft((rules) => [...rules, { id: nextRuleId(rules), tier: 'reject', when: '' }])}>+ Add rule</ActionButton>
        <span className="flex-1" />
        {dirty && <ActionButton onClick={() => setDraft(dataset.rules)}>Discard changes</ActionButton>}
        <ActionButton
          onClick={onTest}
          disabled={!ready || !valid || draft.length === 0 || test.isPending}
          title={ready ? 'Count what these rules would do, without saving' : 'Available once the dataset is ready'}
        >
          {test.isPending ? 'Testing…' : 'Test'}
        </ActionButton>
        <ActionButton onClick={onSave} disabled={!dirty || !valid || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save rules'}
        </ActionButton>
      </div>

      {save.isError && <ErrorText text={cleanError(save.error)} />}
      {save.isSuccess && !dirty && (
        <p className="m-0 text-[12px]" style={{ color: 'var(--success)' }}>
          Saved. The next validate run uses these rules.
        </p>
      )}
      {test.isPending && (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <Spinner /> Counting over every row…
        </div>
      )}
      {test.isError && <ErrorText text={cleanError(test.error)} />}
      {current && <TestSummary result={current} />}
      {tested && !current && !test.isPending && (
        <p className="m-0 text-[12px]" style={{ color: 'var(--text-subtle)' }}>
          The rules changed since the last test.
        </p>
      )}
    </div>
  );
}

interface RuleCardProps {
  index: number;
  count: number;
  rule: QualityRule;
  error?: string;
  stat?: RuleStat;
  onChange: (patch: Partial<QualityRule>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

function RuleCard({ index, count, rule, error, stat, onChange, onMove, onRemove }: RuleCardProps) {
  const tier = RULE_TIERS.find((t) => t.value === rule.tier);
  return (
    <Well className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="os-font-mono os-tabular-nums w-5 text-right text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          {index + 1}
        </span>
        <input
          className={inputClass}
          style={{ ...inputStyle, width: '10rem' }}
          aria-label="Rule id"
          spellCheck={false}
          value={rule.id}
          onChange={(e) => onChange({ id: e.target.value })}
        />
        <select
          className={inputClass}
          style={inputStyle}
          aria-label="What happens to matching rows"
          title={tier?.description}
          value={rule.tier}
          onChange={(e) => onChange({ tier: e.target.value as QualityRule['tier'] })}
        >
          {RULE_TIERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {rule.tier === 'flag' && (
          <input
            className={inputClass}
            style={{ ...inputStyle, width: '12rem' }}
            aria-label="Flag column"
            title="The true/false column added to kept rows"
            spellCheck={false}
            placeholder={flagColumn({ id: rule.id })}
            value={rule.column ?? ''}
            onChange={(e) => onChange({ column: e.target.value })}
          />
        )}
        <Badge tone={tierTone(rule.tier)}>{tier?.description}</Badge>
        <span className="flex-1" />
        <ActionButton onClick={() => onMove(-1)} disabled={index === 0} title="Move up (earlier rules win)" label="Move rule up">
          ↑
        </ActionButton>
        <ActionButton onClick={() => onMove(1)} disabled={index === count - 1} title="Move down" label="Move rule down">
          ↓
        </ActionButton>
        <ActionButton onClick={onRemove} danger title="Remove rule" label="Remove rule">
          ✕
        </ActionButton>
      </div>
      <textarea
        className={inputClass}
        style={{ ...inputStyle, minHeight: '2.6rem', resize: 'vertical' }}
        aria-label="Condition"
        spellCheck={false}
        rows={1}
        placeholder="SQL condition that marks a bad row, e.g. fare < 0"
        value={rule.when}
        onChange={(e) => onChange({ when: e.target.value })}
      />
      <input
        className="os-well rounded-lg px-2.5 py-1.5 text-[12.5px]"
        style={inputStyle}
        aria-label="Note"
        placeholder="Note (optional): what this rule catches"
        value={rule.note ?? ''}
        onChange={(e) => onChange({ note: e.target.value })}
      />
      {error ? (
        <ErrorText text={error} />
      ) : (
        stat && (
          <p className="os-tabular-nums m-0 text-[12px]" style={{ color: 'var(--text-body)' }}>
            {describeStat(stat)}
          </p>
        )
      )}
    </Well>
  );
}

function TestSummary({ result }: { result: RulesTestResult }) {
  if (result.error) return <ErrorText text={result.error} />;
  const n = (v?: number) => (v ?? 0).toLocaleString();
  return (
    <p className="os-tabular-nums m-0 text-[12.5px]" style={{ color: 'var(--text-body)' }}>
      {n(result.rowsIn)} rows → <strong>{n(result.rowsOut)} kept</strong> · {n(result.rejected)} rejected · {n(result.quarantined)} quarantined
      <span style={{ color: 'var(--text-subtle)' }}> · {n(result.durationMs)} ms</span>
    </p>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <p className="m-0 whitespace-pre-wrap text-[12px]" style={{ color: 'var(--danger)' }}>
      {text}
    </p>
  );
}

/** "PUT /api/... failed: 400 rule x: ..." -> "rule x: ..." */
function cleanError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^\w+ \S+ failed: \d+ /, '').replace(/^invalid rules: /, '');
}
