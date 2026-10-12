import { NavLink } from "react-router-dom";

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
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-300">
      <div className="flex items-center gap-3 px-6 pb-6 pt-7">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-300 to-brand-600 text-lg font-black text-slate-900 shadow-lg shadow-brand-500/30">
          J
        </div>
        <div className="leading-tight">
          <p className="text-base font-bold text-white">Joyce Restobar</p>
          <p className="text-xs font-medium uppercase tracking-widest text-brand-300/80">Ledger</p>
        </div>
      </div>

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
        <p className="text-center text-[11px] text-slate-500">Offline · Data saved on this computer</p>
      </div>
    </aside>
  );
}
