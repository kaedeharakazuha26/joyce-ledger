import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import logoImg from "../assets/logo.webp";
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
  const { branches, refreshBranches, deleteBranch, updateBranch, currentBranchId } = useBranch();

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

  // Edit Branch Name states
  const [editBranchModalOpen, setEditBranchModalOpen] = useState(false);
  const [editBranchId, setEditBranchId] = useState<string>("main");
  const [editBranchName, setEditBranchName] = useState<string>("");
  const [savingBranchName, setSavingBranchName] = useState(false);

  // Reset Database Modal states
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetBranchId, setResetBranchId] = useState<string>("main");
  const [resetType, setResetType] = useState<"transactions" | "full">("transactions");
  const [resetPin, setResetPin] = useState("");
  const [showResetPin, setShowResetPin] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Delete Branch Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteBranchId, setDeleteBranchId] = useState<string>("");
  const [deletePin, setDeletePin] = useState("");
  const [showDeletePin, setShowDeletePin] = useState(false);
  const [deletingBranchState, setDeletingBranchState] = useState(false);

  // Non-main branches eligible for deletion
  const customBranches = branches.filter((b) => b.id !== "main");

  // Keep deleteBranchId valid when custom branches change
  useEffect(() => {
    if (customBranches.length > 0 && (!deleteBranchId || deleteBranchId === "main")) {
      setDeleteBranchId(customBranches[0].id);
    }
  }, [customBranches, deleteBranchId]);

  const handleOpenEditBranch = (branchId?: string) => {
    const targetId = branchId || currentBranchId || (branches[0]?.id ?? "main");
    const target = branches.find((b) => b.id === targetId);
    setEditBranchId(targetId);
    setEditBranchName(target?.name || "");
    setEditBranchModalOpen(true);
  };

  const handleBranchSelectChange = (newId: string) => {
    setEditBranchId(newId);
    const target = branches.find((b) => b.id === newId);
    if (target) {
      setEditBranchName(target.name);
    }
  };

  const handleSaveBranchName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBranchName.trim()) {
      toast.error("Branch name cannot be empty.");
      return;
    }
    setSavingBranchName(true);
    try {
      const updated = await updateBranch(editBranchId, editBranchName.trim());
      toast.success(`Branch renamed to "${updated.name}".`);
      setEditBranchModalOpen(false);
    } catch (err) {
      toast.error(`Failed to update branch name: ${errorMessage(err)}`);
    } finally {
      setSavingBranchName(false);
    }
  };

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
      toast.success("Database restored successfully! Reloading application…");
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

  // --- Handlers: Delete Branch ---
  const handleConfirmDeleteBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteBranchId || deleteBranchId === "main") {
      toast.error("Please select a valid custom branch to delete.");
      return;
    }
    if (!deletePin.trim()) {
      toast.error("Please enter the admin PIN to confirm deletion.");
      return;
    }

    setDeletingBranchState(true);
    try {
      await deleteBranch(deleteBranchId, deletePin.trim());
      const deletedName =
        branches.find((b) => b.id === deleteBranchId)?.name || deleteBranchId;
      toast.success(`Branch "${deletedName}" was deleted successfully.`);
      setDeleteModalOpen(false);
      setDeletePin("");
      await refreshBranches();
    } catch (err) {
      toast.error(`Delete failed: ${errorMessage(err)}`);
    } finally {
      setDeletingBranchState(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings & Maintenance"
        description="Manage local database backups, branch configurations, and administrator security credentials."
      />

      <div className="space-y-6">
        {/* Admin Security PIN Card */}
        <section className="card overflow-hidden p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Admin Security & PIN Code
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Controls permissions for deleting entries, resetting database data, and removing branches.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Default PIN: 0000
            </div>
          </div>

          <form onSubmit={handleChangePin} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Current PIN</label>
                <div className="relative mt-1">
                  <input
                    type={showPins ? "text" : "password"}
                    required
                    placeholder="Old PIN (e.g. 0000)"
                    value={oldPin}
                    onChange={(e) => setOldPin(e.target.value)}
                    className="input font-mono tracking-widest text-base"
                  />
                </div>
              </div>

              <div>
                <label className="label">New PIN (4+ digits)</label>
                <div className="relative mt-1">
                  <input
                    type={showPins ? "text" : "password"}
                    required
                    placeholder="New PIN code"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="input font-mono tracking-widest text-base"
                  />
                </div>
              </div>

              <div>
                <label className="label">Confirm New PIN</label>
                <div className="relative mt-1">
                  <input
                    type={showPins ? "text" : "password"}
                    required
                    placeholder="Repeat new PIN"
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value)}
                    className="input font-mono tracking-widest text-base"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer select-none dark:text-slate-400 dark:hover:text-slate-200">
                <input
                  type="checkbox"
                  checked={showPins}
                  onChange={(e) => setShowPins(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900"
                />
                <span>Show PIN characters</span>
              </label>

              <button
                type="submit"
                disabled={changingPin || !oldPin.trim() || !newPin.trim() || !confirmNewPin.trim()}
                className="btn-primary h-11 px-6 text-sm font-semibold"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {changingPin ? "Updating Security PIN…" : "Change Admin PIN"}
              </button>
            </div>
          </form>
        </section>

        {/* Branch Management & Renaming Section */}
        <section className="card card-hover p-6 shadow-sm border-amber-500/20">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Branch Locations & Setup
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Manage branch names and business identities across all your restobar locations.
                </p>
              </div>
            </div>

            <button
              type="button"
              id="settings-edit-branch-btn"
              onClick={() => handleOpenEditBranch(currentBranchId)}
              className="btn border border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 text-xs font-bold dark:text-amber-300 transition flex items-center gap-1.5"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Branch Name…
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => {
              const isCurrent = b.id === currentBranchId;
              return (
                <div
                  key={b.id}
                  className={`flex items-center justify-between rounded-xl border p-3.5 transition-all ${
                    isCurrent
                      ? "border-amber-500/50 bg-amber-50/50 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/20"
                      : "border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-950/30"
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                        {b.name}
                      </p>
                      {b.id === "main" && (
                        <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] font-mono text-slate-400">{b.id}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEditBranch(b.id)}
                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                    title={`Rename ${b.name}`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Database Backup & Restore Section */}
        <section className="card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Database Management
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                All records across all business branches are stored in an offline local SQLite database.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Backup Card */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-950/40">
              <div>
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
                  Saves a complete copy of all branches into a single <code className="rounded bg-slate-200/70 px-1.5 py-0.5 text-xs font-semibold dark:bg-slate-800">.db</code> file. You can store this on a flash drive or safe folder.
                </p>
              </div>

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
            <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-950/40">
              <div>
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
                  Loads records from a previously saved <code className="rounded bg-slate-200/70 px-1.5 py-0.5 text-xs font-semibold dark:bg-slate-800">.db</code> backup. This will replace the current database with the selected snapshot.
                </p>
              </div>

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

        {/* Danger Zone: Reset & Delete Branch */}
        <section className="card border-rose-200/90 p-6 shadow-sm dark:border-rose-900/50">
          <div className="flex items-center gap-3 border-b border-rose-100 pb-4 dark:border-rose-950/60">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-rose-700 dark:text-rose-400">
                Danger Zone: Reset & Branch Management
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Irreversible maintenance operations. All actions require administrator PIN verification.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Action 1: Reset Database Records */}
            <div className="flex flex-col justify-between rounded-xl border border-rose-200/60 bg-rose-50/30 p-4.5 dark:border-rose-900/40 dark:bg-rose-950/20">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </span>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">Reset Branch Records</h3>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Wipe transaction history (sales, expenses, commissions, salaries) or perform a full wipe for a specific branch or all branches.
                </p>
              </div>

              <button
                type="button"
                id="settings-reset-modal-btn"
                onClick={() => {
                  setResetPin("");
                  setResetModalOpen(true);
                }}
                className="btn mt-4 w-full border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 text-sm font-semibold dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/60"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Reset Database Records…
              </button>
            </div>

            {/* Action 2: Delete Branch */}
            <div className="flex flex-col justify-between rounded-xl border border-rose-200/60 bg-rose-50/30 p-4.5 dark:border-rose-900/40 dark:bg-rose-950/20">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </span>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">Delete Branch</h3>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Permanently remove an entire secondary branch and all of its associated transactions, staff rosters, and settings.
                </p>
              </div>

              <button
                type="button"
                id="settings-delete-branch-btn"
                onClick={() => {
                  setDeletePin("");
                  if (customBranches.length > 0) {
                    setDeleteBranchId(customBranches[0].id);
                  }
                  setDeleteModalOpen(true);
                }}
                className="btn-danger mt-4 w-full text-sm font-semibold"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Branch…
              </button>
            </div>
          </div>
        </section>

        {/* System & Architecture Info */}
        <section className="card card-hover p-6 shadow-sm border-amber-500/20">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-3.5">
              <div className="relative group shrink-0">
                <div className="absolute -inset-1 rounded-2xl bg-amber-500/30 blur-sm animate-pulse-glow" />
                <img
                  src={logoImg}
                  alt="Joyce Restobar"
                  className="relative h-12 w-12 rounded-xl object-contain bg-black/90 p-0.5 ring-1 ring-amber-500/50 shadow-md shadow-amber-500/20"
                />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Joyce Restobar Ledger OS
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Official Offline Desktop Application for Joyce Restobar
                </p>
              </div>
            </div>
            <span className="badge-gold">
              v1.0.0 Stable
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Application</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">Joyce Restobar Ledger</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Network & Storage</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">100% Offline (SQLite)</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Branches Active</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {branches.length} configured ({customBranches.length} custom)
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Edit Branch Name Modal */}
      <Modal
        open={editBranchModalOpen}
        title="Edit Branch Name"
        onClose={() => setEditBranchModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditBranchModalOpen(false)}
              disabled={savingBranchName}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={(e) => void handleSaveBranchName(e)}
              disabled={savingBranchName || !editBranchName.trim()}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {savingBranchName ? "Saving…" : "Save Branch Name"}
            </button>
          </>
        }
      >
        <form onSubmit={(e) => void handleSaveBranchName(e)} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Rename this branch. All transactions, staff assignments, and records for this branch will remain fully linked.
          </p>

          <div>
            <label className="label">Select Branch to Rename</label>
            <select
              value={editBranchId}
              onChange={(e) => handleBranchSelectChange(e.target.value)}
              className="select input mt-1 font-medium text-slate-800 dark:text-slate-100"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id === "main" ? "Primary Location" : b.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-branch-name-input" className="label font-bold">
              New Branch Name
            </label>
            <input
              id="edit-branch-name-input"
              type="text"
              required
              autoFocus
              placeholder="e.g. Joyce Restobar - Timog, Makati Branch"
              value={editBranchName}
              onChange={(e) => setEditBranchName(e.target.value)}
              className="input mt-1"
            />
          </div>
        </form>
      </Modal>

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
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {resetting ? "Resetting data…" : "Confirm Reset Data"}
            </button>
          </>
        }
      >
        <form onSubmit={(e) => void handleConfirmReset(e)} className="space-y-5">
          {/* Danger Alert */}
          <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            <svg className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="leading-relaxed">
              <strong className="font-bold">Permanent Action:</strong> This will permanently erase records for the selected branch. Back up your database first if you want to keep copies of past entries.
            </div>
          </div>

          {/* Select Branch */}
          <div>
            <label className="label">Select Branch to Reset</label>
            <select
              value={resetBranchId}
              onChange={(e) => setResetBranchId(e.target.value)}
              className="select input mt-1 font-medium text-slate-800 dark:text-slate-100"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
              <option value="all">⚠️ All Branches (Complete Database Wipe)</option>
            </select>
          </div>

          {/* Reset Scope Selector Cards */}
          <div>
            <label className="label">Choose Reset Scope</label>
            <div className="mt-2 space-y-2.5">
              {/* Option 1 */}
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition select-none ${
                  resetType === "transactions"
                    ? "border-brand-500 bg-brand-50/50 shadow-sm dark:border-brand-500/80 dark:bg-brand-950/30"
                    : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800/40"
                }`}
              >
                <input
                  type="radio"
                  name="resetType"
                  value="transactions"
                  checked={resetType === "transactions"}
                  onChange={() => setResetType("transactions")}
                  className="mt-0.5 h-4 w-4 text-brand-600 focus:ring-brand-500"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    Reset Transactions Only (Recommended)
                  </p>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                    Clears Sales, Expenses, LD Commissions, Commissions, and Salaries. Preserves Employee roster and Categories.
                  </p>
                </div>
              </label>

              {/* Option 2 */}
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition select-none ${
                  resetType === "full"
                    ? "border-rose-500 bg-rose-50/50 shadow-sm dark:border-rose-500/80 dark:bg-rose-950/30"
                    : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800/40"
                }`}
              >
                <input
                  type="radio"
                  name="resetType"
                  value="full"
                  checked={resetType === "full"}
                  onChange={() => setResetType("full")}
                  className="mt-0.5 h-4 w-4 text-rose-600 focus:ring-rose-500"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    Full Reset (Includes Employees)
                  </p>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                    Clears all transactions AND deletes all registered Employee records for this branch.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Admin PIN Box */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Admin Security PIN Required
              </label>
              <button
                type="button"
                onClick={() => setShowResetPin(!showResetPin)}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                {showResetPin ? "Hide PIN" : "Show PIN"}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Enter admin PIN (Default: <span className="font-mono font-semibold">0000</span>) to authorize reset.
            </p>
            <input
              type={showResetPin ? "text" : "password"}
              required
              autoFocus
              placeholder="Enter PIN (e.g. 0000)"
              value={resetPin}
              onChange={(e) => setResetPin(e.target.value)}
              className="input mt-2.5 font-mono tracking-widest text-base"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Branch Modal */}
      <Modal
        open={deleteModalOpen}
        title="Delete Business Branch"
        onClose={() => setDeleteModalOpen(false)}
        footer={
          customBranches.length === 0 ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDeleteModalOpen(false)}
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deletingBranchState}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={(e) => void handleConfirmDeleteBranch(e)}
                disabled={deletingBranchState || !deleteBranchId || !deletePin.trim()}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {deletingBranchState ? "Deleting Branch…" : "Permanently Delete Branch"}
              </button>
            </>
          )
        }
      >
        <form onSubmit={(e) => void handleConfirmDeleteBranch(e)} className="space-y-5">
          {customBranches.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5 text-center text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <svg className="mx-auto h-8 w-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-2 text-sm font-bold">No Custom Branches Available to Delete</p>
              <p className="mt-1 text-slate-600 dark:text-slate-400">
                The primary <strong>Main Branch</strong> is protected and cannot be deleted. You can create secondary branches from the sidebar branch switcher.
              </p>
            </div>
          ) : (
            <>
              {/* Danger Alert */}
              <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                <svg className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="leading-relaxed">
                  <strong className="font-bold">Irreversible Branch Deletion:</strong> Deleting a branch permanently deletes all associated sales, expenses, commissions, salaries, employees, and categories for that branch.
                </div>
              </div>

              {/* Select Branch */}
              <div>
                <label className="label">Select Branch to Delete</label>
                <select
                  value={deleteBranchId}
                  onChange={(e) => setDeleteBranchId(e.target.value)}
                  className="select input mt-1 font-medium text-slate-800 dark:text-slate-100"
                >
                  {customBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.id})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Note: Main Branch is hidden from this list because it cannot be deleted.
                </p>
              </div>

              {/* Branch Summary Box */}
              {deleteBranchId && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/40">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Selected for Deletion: </span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    {branches.find((b) => b.id === deleteBranchId)?.name}
                  </span>
                  <span className="text-slate-400"> ({deleteBranchId})</span>
                  <p className="mt-1 text-slate-500">
                    If this branch is currently selected in your app, your active view will automatically switch back to Main Branch upon deletion.
                  </p>
                </div>
              )}

              {/* Admin PIN Box */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Admin Security PIN Required
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDeletePin(!showDeletePin)}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    {showDeletePin ? "Hide PIN" : "Show PIN"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Enter admin PIN (Default: <span className="font-mono font-semibold">0000</span>) to authorize branch removal.
                </p>
                <input
                  type={showDeletePin ? "text" : "password"}
                  required
                  autoFocus
                  placeholder="Enter PIN (e.g. 0000)"
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value)}
                  className="input mt-2.5 font-mono tracking-widest text-base"
                />
              </div>
            </>
          )}
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
              Warning: Restoring will overwrite all current ledger records with data from:
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
