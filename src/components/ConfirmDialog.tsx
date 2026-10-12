import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "./Modal";
import { verifyAdminPin } from "../lib/api";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  requirePin?: boolean;
  onConfirm: (pin: string) => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busy = false,
  requirePin = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [checkingPin, setCheckingPin] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setPin("");
      setPinError(null);
      setCheckingPin(false);
      setTimeout(() => {
        if (requirePin) {
          pinInputRef.current?.focus();
        } else {
          cancelRef.current?.focus();
        }
      }, 50);
    }
  }, [open, requirePin]);

  const handleAction = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (busy || checkingPin) return;

    if (requirePin) {
      if (!pin.trim()) {
        setPinError("Please enter the admin PIN.");
        pinInputRef.current?.focus();
        return;
      }

      setCheckingPin(true);
      setPinError(null);
      try {
        const valid = await verifyAdminPin(pin.trim());
        if (!valid) {
          setPinError("Incorrect admin PIN. Default is 0000.");
          setCheckingPin(false);
          pinInputRef.current?.focus();
          return;
        }
        await onConfirm(pin.trim());
      } catch {
        setPinError("Failed to verify PIN. Please try again.");
      } finally {
        setCheckingPin(false);
      }
    } else {
      await onConfirm("");
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button
            id="confirm-cancel"
            ref={cancelRef}
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={busy || checkingPin}
          >
            Cancel
          </button>
          <button
            id="confirm-ok"
            type="button"
            className="btn-danger"
            onClick={() => void handleAction()}
            disabled={busy || checkingPin}
          >
            {busy || checkingPin ? "Verifying…" : confirmLabel}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => void handleAction(e)} className="space-y-4">
        <div>{message}</div>

        {requirePin && (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <label
              htmlFor="confirm-delete-pin"
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300"
            >
              <svg className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Admin PIN Required to Delete
            </label>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-400/80">
              Enter admin PIN code (Default is <strong className="font-mono">0000</strong>) to confirm this deletion.
            </p>

            <div className="relative mt-2.5">
              <input
                ref={pinInputRef}
                id="confirm-delete-pin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Enter PIN (e.g. 0000)"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (pinError) setPinError(null);
                }}
                className={`input pr-10 font-mono tracking-widest ${
                  pinError ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500" : ""
                }`}
                disabled={busy || checkingPin}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                tabIndex={-1}
              >
                {showPin ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            {pinError && (
              <p className="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                {pinError}
              </p>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
