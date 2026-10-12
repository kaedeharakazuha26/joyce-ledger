import { forwardRef } from "react";

interface DateInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  compact?: boolean;
}

/** Native date picker. Value is always YYYY-MM-DD (local date). */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { id, label, value, onChange, error, compact },
  ref,
) {
  return (
    <div>
      <label htmlFor={id} className={compact ? "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" : "label"}>
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        type="date"
        className={`input tabular ${compact ? "h-10 w-44 text-sm" : ""} ${error ? "input-error" : ""}`}
        value={value}
        min="1900-01-01"
        max="9999-12-31"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
});
