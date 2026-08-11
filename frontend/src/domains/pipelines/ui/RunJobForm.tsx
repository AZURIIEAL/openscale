import { useMemo, useState } from 'react';
import { RunButton } from '@/shared/design-system/RunButton';
import type { JobParamField } from '../domain/entities';

interface RunJobFormProps {
  fields: JobParamField[];
  pending: boolean;
  onSubmit: (params: Record<string, string>) => void;
}

const MONTH_FIELDS = new Set(['start', 'end']);
const EARLIEST_YEAR = 2009; // NYC TLC trip record data begins January 2009.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;
const YEARS = Array.from({ length: CURRENT_YEAR - EARLIEST_YEAR + 1 }, (_, i) => CURRENT_YEAR - i);

const selectStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--ink)',
  outline: 'none',
} as const;

/**
 * A month field is two plain <select>s (month, year) instead of a native
 * <input type="month">. The native control packs year-entry into a
 * fiddly, easy-to-miss segment inside the same box (click the exact right
 * spot, or hunt for the calendar icon) -- a separate, always-visible Year
 * dropdown removes that guesswork entirely, and sidesteps browsers (older
 * Safari/Firefox) that don't support type="month" well.
 */
function MonthYearField({
  label,
  month,
  year,
  onChange,
}: {
  label: string;
  month: string;
  year: string;
  onChange: (next: { month: string; year: string }) => void;
}) {
  const maxMonth = year === String(CURRENT_YEAR) ? CURRENT_MONTH : 12;

  return (
    <label className="flex flex-col gap-1">
      <span className="os-font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--ink-faint)' }}>
        {label}
      </span>
      <div className="flex gap-1.5">
        <select
          className="os-well os-font-mono rounded-lg px-2.5 py-2 text-[13px]"
          style={selectStyle}
          value={month}
          onChange={(e) => onChange({ month: e.target.value, year })}
          required
        >
          <option value="" disabled>
            Month
          </option>
          {MONTH_NAMES.map((name, i) => {
            const value = String(i + 1).padStart(2, '0');
            return (
              <option key={value} value={value} disabled={Number(value) > maxMonth}>
                {name}
              </option>
            );
          })}
        </select>
        <select
          className="os-well os-font-mono rounded-lg px-2.5 py-2 text-[13px]"
          style={selectStyle}
          value={year}
          onChange={(e) => {
            const nextYear = e.target.value;
            const nextMaxMonth = nextYear === String(CURRENT_YEAR) ? CURRENT_MONTH : 12;
            onChange({ month: Number(month) > nextMaxMonth ? '' : month, year: nextYear });
          }}
          required
        >
          <option value="" disabled>
            Year
          </option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

export function RunJobForm({ fields, pending, onSubmit }: RunJobFormProps) {
  const [values, setValues] = useState<Record<string, { month: string; year: string }>>({});

  const composed = useMemo(() => {
    const result: Record<string, string> = {};
    for (const field of fields) {
      const v = values[field.name];
      if (v?.month && v?.year) result[field.name] = `${v.year}-${v.month}`;
    }
    return result;
  }, [values, fields]);

  const rangeError =
    composed.start && composed.end && composed.start > composed.end ? 'Start must be on or before end.' : null;

  const allFilled = fields.every((field) => composed[field.name]);
  const canSubmit = allFilled && !rangeError && !pending;

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(composed);
      }}
    >
      {fields.map((field) =>
        MONTH_FIELDS.has(field.name) ? (
          <MonthYearField
            key={field.name}
            label={field.label}
            month={values[field.name]?.month ?? ''}
            year={values[field.name]?.year ?? ''}
            onChange={(next) => setValues((v) => ({ ...v, [field.name]: next }))}
          />
        ) : null,
      )}
      <RunButton type="submit" disabled={!canSubmit}>
        {pending ? 'Starting…' : 'Start run'}
      </RunButton>
      {rangeError && (
        <span className="os-font-mono text-[11.5px]" style={{ color: 'var(--crit)' }}>
          {rangeError}
        </span>
      )}
    </form>
  );
}
