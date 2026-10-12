import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "../components/AppLayout";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { backupDatabase, errorMessage, restoreDatabase } from "../lib/api";
import { todayLocal } from "../lib/dates";

export function SettingsPage() {
  const toast = useToast();
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [selectedRestorePath, setSelectedRestorePath] = useState<string | null>(null);

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
      // Wait a moment then reload window to refresh all in-memory React states
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (e) {
      toast.error(`Restore failed: ${errorMessage(e)}`);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings & Maintenance"
        description="Manage local database backups, restore points, and system preferences."
      />

      <div className="space-y-6">
        {/* Backup and Restore Section */}
        <section className="card p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Database Management</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            All your sales, expenses, commissions, and staff records are stored safely in an offline local SQLite database.
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
                Saves a complete copy of all your ledger records into a single <code className="text-xs font-semibold">.db</code> file. You can store this on a USB flash drive or another safe folder.
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
            <div className="rounded-2xl border border-rose-200/60 bg-rose-50/20 p-5 dark:border-rose-900/40 dark:bg-rose-950/10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">Restore Database</h3>
                  <p className="text-xs text-rose-600 dark:text-rose-400">Restore from an existing backup</p>
                </div>
              </div>

              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Loads records from a previously saved <code className="text-xs font-semibold">.db</code> file. This will replace the current data on this computer with the backup file.
              </p>

              <button
                type="button"
                id="settings-restore-btn"
                onClick={handleChooseRestoreFile}
                disabled={restoring}
                className="btn border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 mt-5 w-full dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                </svg>
                {restoring ? "Restoring data…" : "Select Backup File & Restore"}
              </button>
            </div>
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
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Version</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">v1.0.0 (Tauri 2 + SQLite WAL)</p>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmRestoreOpen}
        title="Confirm Database Restore"
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
