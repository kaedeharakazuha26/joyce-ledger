import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import logoImg from "../assets/logo.webp";
import { errorMessage, listUsers, loginWithPin, onSyncEvent } from "../lib/api";
import type { UserAccount } from "../types/models";
import { useBranch } from "./BranchContext";

interface AuthContextValue {
  currentUser: UserAccount | null;
  unlockWithPin: (pin: string) => Promise<UserAccount>;
  lockSession: () => void;
  refreshCurrentUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { refreshBranches } = useBranch();
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [showDefaultHint, setShowDefaultHint] = useState(false);

  const checkDefaultOwnerHint = useCallback(async () => {
    try {
      const users = await listUsers();
      setShowDefaultHint(users.some((u) => u.pin === "0000"));
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    void checkDefaultOwnerHint();
  }, [checkDefaultOwnerHint]);

  const refreshCurrentUser = useCallback(async () => {
    if (!currentUser) return;
    try {
      const users = await listUsers();
      const updated = users.find((u) => u.id === currentUser.id) || users.find((u) => u.name === currentUser.name);
      if (updated) {
        setCurrentUser(updated);
      } else {
        setCurrentUser(null);
      }
    } catch {
      // Ignore transient errors
    }
  }, [currentUser]);

  useEffect(() => onSyncEvent("sync-updated", () => void refreshCurrentUser()), [refreshCurrentUser]);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const user = await loginWithPin(pin);
      setCurrentUser(user);
      await refreshBranches();
      return user;
    },
    [refreshBranches],
  );

  const lockSession = useCallback(() => {
    setCurrentUser(null);
    void checkDefaultOwnerHint();
  }, [checkDefaultOwnerHint]);

  return (
    <AuthContext.Provider value={{ currentUser, unlockWithPin, lockSession, refreshCurrentUser }}>
      {currentUser ? children : <PinLockScreen onUnlock={unlockWithPin} showDefaultHint={showDefaultHint} />}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

function PinLockScreen({
  onUnlock,
  showDefaultHint,
}: {
  onUnlock: (pin: string) => Promise<UserAccount>;
  showDefaultHint: boolean;
}) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const submitPin = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (busy) return;
    const clean = pin.trim();
    if (!clean) {
      setError("Enter your user PIN to unlock.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onUnlock(clean);
      setPin("");
    } catch (err) {
      setError(errorMessage(err));
      setPin("");
      setTimeout(() => inputRef.current?.focus(), 40);
    } finally {
      setBusy(false);
    }
  };

  const tapDigit = (d: string) => {
    if (busy || pin.length >= 12) return;
    setError(null);
    setPin((p) => p + d);
  };

  return (
    <div className="relative flex min-h-full items-center justify-center bg-[#07090e] p-4 text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-[100px]"
      />

      <div className="relative w-full max-w-md rounded-3xl border border-amber-500/25 bg-[#0b0e16] p-7 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute -inset-1 rounded-2xl bg-amber-500/30 blur-sm" />
            <img
              src={logoImg}
              alt="Joyce Restobar"
              className="relative h-16 w-16 rounded-2xl bg-black/90 object-contain p-1 ring-1 ring-amber-500/50"
            />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-400">
            Joyce Restobar Ledger
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Enter your personal Staff or Owner PIN to continue
          </p>
          {showDefaultHint && (
            <span className="mt-2.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-[11px] font-semibold text-amber-300">
              Default Owner PIN: <span className="font-mono font-bold">0000</span>
            </span>
          )}
        </div>

        <form onSubmit={(e) => void submitPin(e)} className="mt-6 space-y-4">
          <div className="relative">
            <input
              ref={inputRef}
              id="lock-pin-input"
              type={showPin ? "text" : "password"}
              autoComplete="off"
              placeholder="Enter PIN…"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error) setError(null);
              }}
              disabled={busy}
              className="input h-12 border-amber-500/30 bg-slate-950 pr-16 text-center font-mono text-xl tracking-[0.35em] text-white focus:border-amber-400"
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-amber-400 hover:text-amber-300"
            >
              {showPin ? "Hide" : "Show"}
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-center text-xs font-semibold text-rose-300">
              {error}
            </div>
          )}

          {/* Quick Touch Keypad */}
          <div className="grid grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => tapDigit(d)}
                disabled={busy}
                className="h-11 rounded-xl border border-slate-800 bg-slate-900/70 text-base font-bold text-slate-100 hover:border-amber-500/40 hover:bg-slate-800 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPin("");
                setError(null);
              }}
              disabled={busy}
              className="h-11 rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors duration-150"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => tapDigit("0")}
              disabled={busy}
              className="h-11 rounded-xl border border-slate-800 bg-slate-900/70 text-base font-bold text-slate-100 hover:border-amber-500/40 hover:bg-slate-800 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((p) => p.slice(0, -1))}
              disabled={busy}
              className="h-11 rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors duration-150"
            >
              &larr; Del
            </button>
          </div>

          <button
            id="lock-unlock-btn"
            type="submit"
            disabled={busy || !pin.trim()}
            className="btn-primary h-12 w-full text-sm font-bold"
          >
            {busy ? "Verifying PIN…" : "Unlock Ledger"}
          </button>
        </form>
      </div>
    </div>
  );
}
