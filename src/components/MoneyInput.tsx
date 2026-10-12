import { forwardRef } from "react";
import { CURRENCY_SYMBOL } from "../lib/money";

interface MoneyInputProps {
  id: string;
  label: string;
  /** Raw text as typed, e.g. "1,234.50". Converted to centavos on submit. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { id, label, value, onChange, error },
  ref,
) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-semibold text-slate-400">
          {CURRENCY_SYMBOL}
        </span>
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          className={`input tabular pl-9 text-right font-semibold ${error ? "input-error" : ""}`}
          value={value}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
});
