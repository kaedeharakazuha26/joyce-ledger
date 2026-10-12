import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "../components/AppLayout";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { useBranch } from "../context/BranchContext";
import {
  backupDatabase,
  changeAdminPin,
  errorMessage,
  resetDatabase,
  restoreDatabase,
} from "../lib/api";
import { todayLocal } from "../lib/dates";

export function SettingsPage() {
  const toast = useToast();
  const { branches, refreshBranches } = useBranch();

  // Backup & Restore states
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [selectedRestorePath, setSelectedRestorePath] = useState<string | null>(null);

  // Change PIN states
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [showPins, setShowPins] = useState(false);
  const [changingPin, setChangingPin] = useState(false);

  // Reset Database Modal states
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetBranchId, setResetBranchId] = useState<string>("main");
  const [resetType, setResetType] = useState<"transactions" | "full">("transactions");
  const [resetPin, setResetPin] = useState("");
  const [showResetPin, setShowResetPin] = useState(false);
  const [resetting, setResetting] = useState(false);

  // --- Handlers: Backup & Restore ---
  const handleBackup = async () => {
    try {
      const path = await save({
        title: "Back up Joyce Restobar Ledger database",
        defaultPath: `joyce-ledger-backup-${todayLocal()}.db`,
        filters: [{ name: "SQLite database", extensions: ["db"] }],
      });
      if (!path) return;
      setBackingUp(true);
      await backupDatabase(path);
      toast.success("Database backup saved successfully.");
    } catch (e) {
      toast.error(`Backup failed: ${errorMessage(e)}`);
    } finally {
      setBackingUp(false);
    }
  };

  const handleChooseRestoreFile = async () => {
    try {
      const selected = await open({
        title: "Select Joyce Restobar Ledger backup file to restore",
        multiple: false,
        directory: false,
        filters: [{ name: "SQLite database", extensions: ["db"] }],
      });
      if (!selected) return;
      const path = typeof selected === "string" ? selected : selected;
      setSelectedRestorePath(path);
      setConfirmRestoreOpen(true);
    } catch (e) {
      toast.error(`Failed to select file: ${errorMessage(e)}`);
    }
  };

  const handleConfirmRestore = async () => {
    if (!selectedRestorePath) return;
    setRestoring(true);
    try {
      await restoreDatabase(selectedRestorePath);
      toast.success("Database restored successfully! Reloading data…");
      setConfirmRestoreOpen(false);
      setSelectedRestorePath(null);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (e) {
      toast.error(`Restore failed: ${errorMessage(e)}`);
    } finally {
      setRestoring(false);
    }
  };

  // --- Handlers: Change Admin PIN ---
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPin.trim() || !newPin.trim() || !confirmNewPin.trim()) {
      toast.error("Please fill in all PIN fields.");
      return;
    }
    if (newPin.trim() !== confirmNewPin.trim()) {
      toast.error("New PIN and Confirm PIN do not match.");
      return;
    }
    if (newPin.trim().length < 4) {
      toast.error("New PIN must be at least 4 digits or characters.");
      return;
    }

    setChangingPin(true);
    try {
      await changeAdminPin(oldPin.trim(), newPin.trim());
      toast.success("Admin PIN successfully updated!");
      setOldPin("");
      setNewPin("");
      setConfirmNewPin("");
    } catch (err) {
      toast.error(`Failed to update PIN: ${errorMessage(err)}`);
    } finally {
      setChangingPin(false);
    }
  };

  // --- Handlers: Reset Database ---
  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPin.trim()) {
      toast.error("Please enter the admin PIN.");
      return;
    }

    setResetting(true);
    try {
      await resetDatabase(resetBranchId, resetPin.trim(), resetType);
      toast.success("Selected database records have been reset.");
      setResetModalOpen(false);
      setResetPin("");
      await refreshBranches();
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      toast.error(`Reset failed: ${errorMessage(err)}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings & Maintenance"
        description="Manage local database backups, branch reset points, and admin security credentials."
      />

      <div className="space-y-6">
        {/* Admin Security PIN Card */}
        <section className="card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Admin Security & PIN Code</h2>
              <p className="text-xs text-slate-500">
                Default PIN is <strong className="font-mono text-slate-700 dark:text-slate-300">0000</strong>. Required for deleting records and resetting branch data.
              </p>
            </div>
          </div>

          <form onSubmit={handleChangePin} className="mt-6 max-w-xl space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Current PIN</label>
                <input
                  type={showPins ? "text" : "password"}
                  required
                  placeholder="Old PIN (e.g. 0000)"
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                  className="input-text mt-1 font-mono tracking-wider"
                />
              </div>

              <div>
                <label className="label">New PIN (4+ digits)</label>
                <input
                  type={showPins ? "text" : "password"}
                  required
                  placeholder="New PIN"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="input-text mt-1 font-mono tracking-wider"
                />
              </div>

              <div>
                <label className="label">Confirm New PIN</label>
                <input
                  type={showPins ? "text" : "password"}
                  required
                  placeholder="Repeat New PIN"
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value)}
                  className="input-text mt-1 font-mono tracking-wider"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPins}
                  onChange={(e) => setShowPins(e.target.checked)}
                  className="rounded border-slate-300 text-brand-500 focus:ring-brand-400"
                />
                Show PIN digits
              </label>

              <button
                type="submit"
                disabled={changingPin || !oldPin.trim() || !newPin.trim()}
                className="btn-primary text-xs"
              >
                {changingPin ? "Updating PIN…" : "Change Admin PIN"}
              </button>
            </div>
          </form>
        </section>

        {/* Backup and Restore Section */}
        <section className="card p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Database Management</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            All your sales, expenses, commissions, and staff records across all branches are stored safely in an offline local SQLite database.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Backup Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">Back Up Database</h3>
                  <p className="text-xs text-slate-500">Create a portable snapshot file</p>
                </div>
              </div>

              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Saves a complete copy of all branches into a single <code className="text-xs font-semibold">.db</code> file. You can store this on a flash drive or safe folder.
              </p>

              <button
                type="button"
                id="settings-backup-btn"
                onClick={handleBackup}
                disabled={backingUp}
                className="btn-primary mt-5 w-full"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {backingUp ? "Creating backup…" : "Back Up Database Now"}
              </button>
            </div>

            {/* Restore Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">Restore Database</h3>
                  <p className="text-xs text-slate-500">Restore from an existing backup</p>
                </div>
              </div>

              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Loads records from a previously saved <code className="text-xs font-semibold">.db</code> backup. This restores all business branch data from the chosen file.
              </p>

              <button
                type="button"
                id="settings-restore-btn"
                onClick={handleChooseRestoreFile}
                disabled={restoring}
                className="btn border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 mt-5 w-full dark:border-indigo-900 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                </svg>
                {restoring ? "Restoring data…" : "Select Backup File & Restore"}
              </button>
            </div>
          </div>
        </section>

        {/* Danger Zone: Reset Database Section */}
        <section className="card border-rose-300/80 p-6 dark:border-rose-900/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-rose-700 dark:text-rose-400">Danger Zone: Reset Database</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Clear all ledger entries and data for a specific branch or all branches. Requires admin password authorization.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setResetPin("");
                setResetModalOpen(true);
              }}
              className="btn border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Reset Database…
            </button>
          </div>
        </section>

        {/* System & Architecture Info */}
        <section className="card p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">System & Environment</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">App Name</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">Joyce Restobar Ledger</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Network Mode</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">100% Offline (Local SQLite)</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Branches Active</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{branches.length} configured</p>
            </div>
          </div>
        </section>
      </div>

      {/* Reset Database Modal */}
      <Modal
        open={resetModalOpen}
        title="Reset Business Database"
        onClose={() => setResetModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setResetModalOpen(false)}
              disabled={resetting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={(e) => void handleConfirmReset(e)}
              disabled={resetting || !resetPin.trim()}
            >
              {resetting ? "Resetting data…" : "Confirm Reset Data"}
            </button>
          </>
        }
      >
        <form onSubmit={(e) => void handleConfirmReset(e)} className="space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            <strong>Warning:</strong> This permanently erases selected ledger data. Make sure you back up your database before proceeding.
          </div>

          <div>
            <label className="label">Select Branch to Reset</label>
            <select
              value={resetBranchId}
              onChange={(e) => setResetBranchId(e.target.value)}
              className="input-text mt-1"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
              <option value="all">⚠️ All Branches (Complete Database Wipe)</option>
            </select>
          </div>

          <div>
            <label className="label">Reset Scope</label>
            <div className="mt-2 space-y-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="resetType"
                  value="transactions"
                  checked={resetType === "transactions"}
                  onChange={() => setResetType("transactions")}
                  className="text-brand-500 focus:ring-brand-400"
                />
                <span>Reset Transaction Records Only (Sales, Expenses, LD, Commissions, Salaries)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="resetType"
                  value="full"
                  checked={resetType === "full"}
                  onChange={() => setResetType("full")}
                  className="text-brand-500 focus:ring-brand-400"
                />
                <span>Full Reset (Also erase Employees list for this branch)</span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <label className="label flex items-center justify-between">
              <span>Admin PIN / Password (Default: 0000)</span>
              <button
                type="button"
                onClick={() => setShowResetPin(!showResetPin)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showResetPin ? "Hide" : "Show"}
              </button>
            </label>
            <input
              type={showResetPin ? "text" : "password"}
              required
              autoFocus
              placeholder="Enter PIN (e.g. 0000)"
              value={resetPin}
              onChange={(e) => setResetPin(e.target.value)}
              className="input-text mt-1 font-mono tracking-widest"
            />
          </div>
        </form>
      </Modal>

      {/* Confirm Restore Dialog */}
      <ConfirmDialog
        open={confirmRestoreOpen}
        title="Confirm Database Restore"
        requirePin={true}
        message={
          <>
            <p className="font-medium text-rose-600 dark:text-rose-400">
              Warning: Restoring will overwrite all current ledger records with the data from:
            </p>
            <p className="mt-2 rounded-lg bg-slate-100 p-2 text-xs font-mono break-all dark:bg-slate-800">
              {selectedRestorePath}
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Make sure you have a current backup if you need to keep your recent entries.
            </p>
          </>
        }
        confirmLabel="Yes, Restore Data"
        busy={restoring}
        onConfirm={handleConfirmRestore}
        onCancel={() => {
          setConfirmRestoreOpen(false);
          setSelectedRestorePath(null);
        }}
      />
    </>
  );
}
