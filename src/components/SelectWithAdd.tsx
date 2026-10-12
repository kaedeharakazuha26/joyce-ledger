import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectWithAddProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (string | SelectOption)[];
  placeholder?: string;
  error?: string;
  onAdd?: (newVal: string) => Promise<void> | void;
  addTitle?: string;
  addPlaceholder?: string;
  emptyNotice?: string;
  customAction?: ReactNode;
}

export function SelectWithAdd({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "Select an option…",
  error,
  onAdd,
  addTitle = "Add new option",
  addPlaceholder = "Enter name…",
  emptyNotice,
  customAction,
}: SelectWithAddProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState("");
  const [busy, setBusy] = useState(false);

  const normalizedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : opt,
  );

  const handleOpenModal = () => {
    setNewValue("");
    setAddError("");
    setModalOpen(true);
  };

  const handleSaveNew = async () => {
    const trimmed = newValue.trim();
    if (!trimmed) {
      setAddError("Name cannot be empty.");
      return;
    }
    if (onAdd) {
      setBusy(true);
      try {
        await onAdd(trimmed);
        onChange(trimmed);
        setModalOpen(false);
      } catch (err) {
        setAddError(typeof err === "string" ? err : err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="label">
          {label}
        </label>
        {customAction}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select
            id={id}
            value={value}
            onChange={(e) => {
              if (e.target.value === "__ADD_NEW__") {
                handleOpenModal();
              } else {
                onChange(e.target.value);
              }
            }}
            className={`input cursor-pointer appearance-none pr-10 font-medium ${
              !value ? "text-slate-400" : ""
            } ${error ? "input-error" : ""}`}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
          >
            <option value="" disabled>
              {placeholder}
            </option>
            {normalizedOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="text-slate-900 dark:text-slate-100">
                {opt.label}
              </option>
            ))}
            {onAdd && (
              <option value="__ADD_NEW__" className="font-semibold text-brand-600 dark:text-brand-400">
                + Add new option…
              </option>
            )}
          </select>

          {/* Custom Chevron icon */}
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {onAdd && (
          <button
            type="button"
            id={`${id}-add-btn`}
            onClick={handleOpenModal}
            title={addTitle}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-brand-300 bg-brand-50 text-brand-600 shadow-sm transition hover:bg-brand-500 hover:text-white dark:border-brand-600/30 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500 dark:hover:text-white active:scale-95"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>

      {emptyNotice && normalizedOptions.length === 0 && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{emptyNotice}</p>
      )}

      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}

      {/* Add Option Modal */}
      <Modal
        open={modalOpen}
        title={addTitle}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setModalOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveNew}
              disabled={busy}
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label htmlFor={`${id}-new-input`} className="label">
            Name
          </label>
          <input
            id={`${id}-new-input`}
            type="text"
            autoFocus
            className={`input ${addError ? "input-error" : ""}`}
            placeholder={addPlaceholder}
            value={newValue}
            onChange={(e) => {
              setNewValue(e.target.value);
              if (addError) setAddError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSaveNew();
              }
            }}
          />
          {addError && <p className="field-error">{addError}</p>}
        </div>
      </Modal>
    </div>
  );
}
