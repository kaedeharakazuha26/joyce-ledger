import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useBranch } from "../context/BranchContext";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

const ICONS: Record<string, string> = {
  dashboard: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 14a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5zm10 3a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2z",
  sales: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
  expenses: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
  ld: "M8 21h8m-4-4v4m-5-17h10l-1 7a4 4 0 01-8 0L7 4z",
  commission: "M11.05 4.6c.3-.9 1.6-.9 1.9 0l1.5 4.6h4.8c1 0 1.4 1.2.6 1.8l-3.9 2.8 1.5 4.6c.3.9-.8 1.7-1.5 1.1L12 16.7l-3.9 2.8c-.8.6-1.8-.2-1.5-1.1l1.5-4.6-3.9-2.8c-.8-.6-.4-1.8.6-1.8h4.8l1.5-4.6z",
  salary: "M12 8c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2m0-8c1.1 0 2.1.4 2.6 1M12 8V7m0 1v8m0 0v1m0-1c-1.1 0-2.1-.4-2.6-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  employees: "M17 20h5v-2a3 3 0 00-5.4-1.9M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.9M7 20H2v-2a3 3 0 015.4-1.9M7 20v-2c0-.7.1-1.3.4-1.9m0 0a5 5 0 019.2 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/sales", label: "Sales", icon: "sales" },
  { to: "/expenses", label: "Expenses", icon: "expenses" },
  { to: "/ld-commission", label: "LD Commission", icon: "ld" },
  { to: "/commission", label: "Commission", icon: "commission" },
  { to: "/salary", label: "Salary", icon: "salary" },
  { to: "/employees", label: "Employees", icon: "employees" },
];

function Icon({ path }: { path: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export function Sidebar() {
  const toast = useToast();
  const { branches, currentBranch, currentBranchId, switchBranch, createBranch } = useBranch();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [addingBranch, setAddingBranch] = useState(false);

  const handleSelectBranch = async (branchId: string) => {
    if (branchId === currentBranchId) {
      setDropdownOpen(false);
      return;
    }
    try {
      await switchBranch(branchId);
      const target = branches.find((b) => b.id === branchId);
      toast.success(`Switched to branch: ${target?.name || branchId}`);
    } catch {
      toast.error("Failed to switch branch.");
    } finally {
      setDropdownOpen(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    setAddingBranch(true);
    try {
      const created = await createBranch(newBranchName.trim());
      toast.success(`Branch "${created.name}" created and activated.`);
      setNewBranchName("");
      setAddBranchOpen(false);
    } catch {
      toast.error("Failed to create branch.");
    } finally {
      setAddingBranch(false);
    }
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-300">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-6 pb-4 pt-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-300 to-brand-600 text-lg font-black text-slate-900 shadow-lg shadow-brand-500/30">
          J
        </div>
        <div className="leading-tight">
          <p className="text-base font-bold text-white">Joyce Restobar</p>
          <p className="text-xs font-medium uppercase tracking-widest text-brand-300/80">Ledger</p>
        </div>
      </div>

      {/* Branch Selector Widget */}
      <div className="relative px-3 pb-3">
        <button
          type="button"
          id="sidebar-branch-select-btn"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10 hover:border-white/20"
        >
          <div className="flex items-center gap-2.5 truncate">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
            <div className="truncate leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Branch</p>
              <p className="truncate text-sm font-bold text-white">
                {currentBranch?.name || "Main Branch"}
              </p>
            </div>
          </div>
          <svg
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
            <div className="absolute left-3 right-3 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl backdrop-blur-md">
              <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Select Branch
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {branches.map((b) => {
                  const isCurrent = b.id === currentBranchId;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => void handleSelectBranch(b.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
                        isCurrent
                          ? "bg-brand-500/20 text-brand-300"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="truncate">{b.name}</span>
                      {isCurrent && (
                        <svg className="h-4 w-4 shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-1.5 border-t border-slate-800 pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    setAddBranchOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold text-brand-400 hover:bg-brand-500/10"
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add New Branch…
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            id={`nav-${item.icon}`}
            className={({ isActive }) =>
              `group relative flex h-12 items-center gap-3 rounded-xl px-4 text-[15px] font-semibold transition ${
                isActive
                  ? "bg-white/10 text-white shadow-inner"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-400 transition-opacity ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className={isActive ? "text-brand-300" : ""}>
                  <Icon path={ICONS[item.icon]} />
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer / Settings Link */}
      <div className="space-y-3 p-4 border-t border-white/5">
        <NavLink
          to="/settings"
          id="nav-settings"
          className={({ isActive }) =>
            `flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
              isActive
                ? "bg-brand-500 text-white shadow-md shadow-brand-500/25"
                : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            }`
          }
        >
          <Icon path={ICONS.settings} />
          Settings & Database
        </NavLink>
        <p className="text-center text-[11px] text-slate-500">Offline · Branch data saved locally</p>
      </div>

      {/* Modal to Add New Branch */}
      <Modal
        open={addBranchOpen}
        title="Add New Business Branch"
        onClose={() => setAddBranchOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setAddBranchOpen(false)}
              disabled={addingBranch}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={(e) => void handleCreateBranch(e)}
              disabled={addingBranch || !newBranchName.trim()}
            >
              {addingBranch ? "Creating…" : "Create & Switch"}
            </button>
          </>
        }
      >
        <form onSubmit={(e) => void handleCreateBranch(e)} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Each branch has its own completely independent set of sales, operating expenses, commissions, and staff records.
          </p>
          <div>
            <label htmlFor="new-branch-name-input" className="label font-bold">
              Branch Name
            </label>
            <input
              id="new-branch-name-input"
              type="text"
              autoFocus
              required
              placeholder="e.g. Branch 2, Makati Branch, Taguig Branch"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              className="input-text mt-1"
            />
          </div>
        </form>
      </Modal>
    </aside>
  );
}
