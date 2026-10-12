import { forwardRef, type InputHTMLAttributes } from "react";

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** Autocomplete values shown via a native <datalist>. */
  suggestions?: string[];
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { id, label, value, onChange, error, suggestions, className, ...rest },
  ref,
) {
  const listId = suggestions && suggestions.length > 0 ? `${id}-suggestions` : undefined;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        type="text"
        autoComplete="off"
        className={`input ${className ?? ""} ${error ? "input-error" : ""}`}
        value={value}
        list={listId}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {listId && (
        <datalist id={listId}>
          {suggestions!.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
});
