# Joyce Restobar & Lounge — Ledger & Financial Management System

An offline-first, multi-laptop desktop ledger and financial reporting system engineered specifically for **Joyce Restobar & Lounge**. Built with **Tauri 2**, **Rust**, **SQLite**, **Turso (libSQL HTTP v2 Sync)**, **React 18**, **TypeScript**, **Vite**, and **Tailwind CSS**.

---

## 📸 Screenshots

### Black-Gold Dashboard & Live Analytics
![Joyce Restobar Ledger Dashboard](./screenshot/Screenshot%202026-11-17%20181009.png)

### Turso Cloud Sync & Multi-Laptop Settings
![Cloud Sync (Turso) & Multi-Laptop Setup](./screenshot/Screenshot%202026-11-17%20181107.png)

---

## 🌟 Key Features & How the App Works

### 1. Offline-First Multi-Laptop Cloud Sync (Turso)
- **Concurrent Multi-Laptop Entry (3–10+ Devices)**: Every device writes first to its fast local SQLite database (`<1ms`, zero lock contention, works even when internet drops) and syncs automatically to Turso's HTTP v2 pipeline (`/v2/pipeline`) with adaptive cadence (pushing within ~2s on local edits, polling every 30s idle / 60s on error to minimize Turso row reads).
- **Conflict-Free Sync IDs**: Schema migrations `v5`–`v6` equip every record and user account with a unique `sync_id` (32-hex UUID for transactions/users; deterministic natural keys for branches, categories, and employees) and trigger-driven `sync_outbox` (`WITHOUT ROWID`), preventing auto-increment ID collisions or overwritten rows when multiple laptops save simultaneously offline.
- **Per-Laptop Device Identity & Local Branch Isolation**: Each computer sets its own **Device Name** (e.g., *Main Cashier Laptop*, *Branch 2 Desk*) and keeps `active_branch`, `turso_url`, and `turso_token` local in `local_settings`—so one cashier switching branches never switches another laptop's active branch.
- **Single Shared Database for All Branches**: One Turso database safely stores every branch (partitioned by `branch_id`) and syncs live status to the sidebar footer (`Turso Cloud Synced`, `Offline · N queued`, or `Local Offline Mode`).

### 2. Multi-Branch Operations
- **Branch Switcher**: Instantly switch between branches (e.g. *Main Branch*, *Branch 2*, etc.) from the sidebar.
- **Isolated Branch Data**: All transactions (Sales, Expenses, LD Commissions, Commissions, Salaries, and Employees) are partitioned by `branch_id`.
- **Branch Management**: Create new branches, rename existing branches, or delete branches (with automated cascade protection and admin authorization).

### 3. Black-Gold Visual Analytics & Interactive Dashboard
- **2×2 Black-Gold Overview Grid**:
  - **Cashflow (Sankey Flow Diagram)**: Interactive flow mapping Sales Categories into **Gross Sales**, splitting out into **Operating Expenses**, **Salaries Paid**, **LD Commissions**, **Commissions**, and **Net Profit**.
  - **Net Profit Trend**: Hero Net Profit total and profit margin % paired with a cumulative daily net cashflow area/line chart.
  - **Sales vs. Outflows Pacing**: Side-by-side **Gross Sales** vs. **Total Outflows** callouts with dual cumulative pacing trend lines.
  - **Outflows Donut & Breakdown Table**: Multi-segment Donut Ring showing **Total Outflows** alongside a `Categories | Value | Weight` table combining expense categories and staff payout totals.
- **Executive KPIs & Staff Earnings Ranking**: Real-time summary cards, employee payout leaderboard (drink counts, LD commissions, sales commissions, salaries), and category distributions.
- **Flexible Date Filtering**: Filter analytics by *Today*, *Yesterday*, *This Week*, *This Month*, *This Year*, or any custom *Date Range*.

### 4. Print & PDF Audit Report Engine
Clicking **"Print Report"** opens a customizable report generator:
- **Comprehensive Audit Dossier (All-in-One)**: Full management packet containing the Executive Financial Summary, Category Margin Breakdowns, Staff Earnings Ranking, and Daily Cash Flows.
- **Staff Earnings & Payout Ranking Report**: Official payroll ledger detailing staff ranks, drink quantities, LD commissions, sales commissions, base salaries, and individual totals.
- **Daily Financial Cash Flows Statement**: Chronological day-by-day inflow, outflow, and net margin statement.
- **Executive Financial Statement**: High-level profit & loss report with category distribution.
- **Official Print Styling**: Automatically suppresses screen navigation, applies clean black-and-white print contrast, embeds the official Joyce Restobar crest, branch header, date period, and auditor sign-off lines (*Prepared by*, *Verified by*, *Approved by*).

### 5. Ledger Modules & Transaction Entry
- **Sales Ledger**: Track orders and revenues. Features category selection with an instant "+ Add Category" modal.
- **Operating Expenses**: Track inventory, utilities, maintenance, and supplies with categorized tagging.
- **LD Commission (Ladies' Drink)**: Track drink quantities and commissions per staff member, with employee dropdown selectors tied to the employee roster.
- **Commissions & Base Salary**: Track sales commissions, bonuses, and fixed staff payroll disbursements.
- **Employee Roster**: Register active staff and positions (Cashier, Bartender, Server, PR, etc.) with default base salary, commission, and LD commission per drink rates.

### 6. Multi-User PINs, Permissions & Triple-Layer Anti-Wipe Safety (`v2.1.0`)
- **Multi-User PIN Accounts**: Create accounts with unique PINs, optional assigned branches (branch-locked cashiers), and role presets (**Owner / Admin**, **Manager**, **Cashier**, **Custom**) synced automatically across all laptops via Turso.
- **7 Granular Permissions**: Control per-user access to **View Dashboard**, **Add Records**, **Edit Records**, **Delete Records**, **Manage Employees**, **Manage Branches**, and **Database Settings & Turso Sync**.
- **On-the-Spot Manager/Owner Delete Override**: Cashiers can enter daily transactions freely without delete rights; attempting a deletion prompts for a Manager or Owner PIN without logging the cashier out.
- **Triple-Layer Anti-Wipe Safety**:
  1. **Owner-Only Destructive Settings**: Only accounts with **Settings & Admin** permission can reset records, delete branches, overwrite via restore, or alter Turso Cloud Sync settings (with anti-lockout protection so the last Owner/Admin cannot be deleted).
  2. **Typed `RESET` Safety Gate**: Resetting database records requires both the Owner/Admin PIN and typing `RESET` to confirm.
  3. **Automatic Safety Snapshots (1-Click Undo)**: Every reset, branch deletion, or restore automatically writes a timestamped SQLite snapshot to `safety_backups/` (`before_reset`, `before_delete_branch`, `before_restore`) that owners can restore in one click from Settings.
- **Change Admin PIN & Manual Backup**: Update the Owner PIN or export a hot SQLite backup to any folder (restores preserve each laptop's local device identity and Turso sync credentials).

---

## 📁 Project Structure

```text
ledger-app-react-rust/
├── .github/
│   └── workflows/
│       └── release.yml          # Automated CI/CD: builds Linux AppImage/deb, Mac dmg, Windows msi/exe
├── docs/
│   └── superpowers/             # Design specification and implementation plan docs
├── screenshot/                  # Application screenshots for documentation
├── src/                         # Frontend Application (React 18 + TypeScript + Vite)
│   ├── assets/                  # Brand assets (logo.webp, icons)
│   ├── components/              # Reusable UI component library
│   │   ├── AppLayout.tsx        # Shell layout, navigation bar, and page headers
│   │   ├── Charts.tsx           # CashflowSankeyCard, NetProfitTrendCard, SalesVsOutflowsCard, OutflowsDonutCard, CashFlowChart, StaffRankChart
│   │   ├── ConfirmDialog.tsx    # Modal confirmation dialogues
│   │   ├── DataTable.tsx        # High-performance sorted data grid with totals
│   │   ├── DateInput.tsx        # Form date picker
│   │   ├── DateRangeFilter.tsx  # Preset and custom date range filter component
│   │   ├── EmptyState.tsx       # Zero-state illustration placeholders
│   │   ├── Modal.tsx            # Accessible modal dialog container
│   │   ├── MoneyInput.tsx       # Currency formatting input (PHP ₱)
│   │   ├── RecordModule.tsx     # Generic CRUD view for Sales, Expenses, Salaries, etc.
│   │   ├── Sidebar.tsx          # Navigation sidebar with branch switcher, device identity & Turso sync badge
│   │   ├── TextInput.tsx        # Form text inputs with autocomplete datalist
│   │   └── Toast.tsx            # Floating feedback notifications
│   ├── context/
│   │   ├── AuthContext.tsx      # Black-Gold PIN Lock screen, active user session & role permissions
│   │   └── BranchContext.tsx    # Global active branch state and branch management
│   ├── hooks/
│   │   ├── useRecords.ts        # Generic transaction hook (fetch, add, edit, delete, CSV export, sync refresh)
│   │   └── useSuggestions.ts    # Autocomplete suggestion hook
│   ├── lib/
│   │   ├── api.ts               # Typed Tauri IPC + browser dev-bridge wrappers
│   │   ├── dates.ts             # Date range utilities, presets, and formatting
│   │   └── money.ts             # Centavo-safe integer currency math and PHP ₱ formatting
│   ├── pages/                   # Main Application Views
│   │   ├── DashboardPage.tsx    # 2x2 Black-Gold analytics grid, visual charts, and printable report modal
│   │   ├── SalesPage.tsx        # Sales ledger view
│   │   ├── ExpensesPage.tsx     # Operating expenses ledger view
│   │   ├── LdCommissionPage.tsx # Ladies' Drink commission tracker
│   │   ├── CommissionPage.tsx   # Staff sales commission view
│   │   ├── SalaryPage.tsx       # Staff salary ledger view
│   │   ├── EmployeesPage.tsx    # Staff roster management view
│   │   └── SettingsPage.tsx     # Turso Cloud Sync, Device Name, Security PIN, Branch management, Backup & Restore
│   ├── types/
│   │   └── models.ts            # TypeScript interfaces matching Rust structs
│   ├── App.tsx                  # Client-side router and route definitions
│   ├── index.css                # Tailwind CSS, custom design tokens, @media print rules
│   └── main.tsx                 # React DOM mount point
├── src-tauri/                   # Desktop Backend (Rust + Tauri v2)
│   ├── icons/                   # Multi-resolution application icons (.ico, .icns, .png)
│   ├── src/
│   │   ├── commands/            # Tauri IPC command handlers
│   │   │   ├── admin.rs         # PIN verification, branch CRUD, Turso sync & device settings
│   │   │   ├── commissions.rs   # Commission CRUD operations
│   │   │   ├── employees.rs     # Employee CRUD operations
│   │   │   ├── expenses.rs      # Expense CRUD operations
│   │   │   ├── export.rs        # CSV streaming and SQLite database backup/restore
│   │   │   ├── ld_commissions.rs# LD commission CRUD operations
│   │   │   ├── salaries.rs      # Salary CRUD operations
│   │   │   ├── sales.rs         # Sales CRUD operations
│   │   │   └── suggestions.rs   # Category and name autocomplete queries
│   │   ├── db/
│   │   │   ├── mod.rs           # DbState, SQLite WAL configuration & connection lifecycle
│   │   │   ├── migrations.rs    # Incremental SQLite schema migrations (v1-v6)
│   │   │   └── sync.rs          # Conflict-free Turso HTTP v2 pipeline sync engine
│   │   ├── error.rs             # Centralized AppError enum (thiserror)
│   │   ├── lib.rs               # Tauri plugin registration, background sync worker & builder entrypoint
│   │   ├── main.rs              # Desktop executable main entrypoint
│   │   ├── models/              # Rust domain models, validations, and filters
│   │   └── money.rs             # Exact integer centavo math utilities
│   ├── Cargo.toml               # Rust dependencies and compiler optimization profiles
│   └── tauri.conf.json          # Tauri window configuration, bundle settings, and capabilities
├── vite-sqlite-bridge.mjs       # Local Node SQLite + Turso HTTP dev bridge for browser preview
├── vite.config.ts               # Vite configuration with local dev bridge plugin
├── package.json                 # Node.js dependencies and script commands
├── tailwind.config.js           # Amber/Gold color theme and luxury styling tokens
└── tsconfig.json                # TypeScript compiler configuration
```

---

## 🛠️ Getting Started & Development

### 1. Prerequisites
- **Node.js**: v18+ (includes `npm`): [https://nodejs.org](https://nodejs.org)
- **Rust**: Stable toolchain (`cargo`): [https://rustup.rs](https://rustup.rs)
- **Tauri System Dependencies**:
  - **Linux (Ubuntu/Debian)**:
    ```bash
    sudo apt update
    sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
    ```
  - **Windows**: Microsoft C++ Build Tools + WebView2 (preinstalled on Windows 10/11)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Mode
Starts the Vite dev server with Hot Module Replacement and launches the Tauri desktop shell:
```bash
npm run tauri dev
```

### 4. Run Rust & Frontend Tests
```bash
# Run all 31+ Rust backend unit tests
npm run test:rust

# Verify TypeScript types and Vite build
npm run build
```

---

## 📦 Building Installers & Distribution

### 1. Build for Your Current Platform (Local)
To compile an optimized release binary and generate native installers for your current operating system:
```bash
npm run build:tauri
```
Installers are output directly to `src-tauri/target/release/bundle/`:

| Operating System | Output Format | Location |
| :--- | :--- | :--- |
| **Linux** | `.AppImage` (portable) & `.deb` | `src-tauri/target/release/bundle/appimage/` & `bundle/deb/` |
| **Windows** | `.msi` (installer) & `.exe` (NSIS) | `src-tauri/target/release/bundle/msi/` & `bundle/nsis/` |
| **macOS** | `.dmg` (drag-and-drop disk image) | `src-tauri/target/release/bundle/dmg/` |

### 2. Multi-Platform Automated Builds (GitHub Actions)
A preconfigured workflow is included in [`.github/workflows/release.yml`](.github/workflows/release.yml).
Pushing a version tag triggers GitHub to build **Linux (.AppImage, .deb)**, **macOS (.dmg)**, and **Windows (.msi, .exe)** in parallel in the cloud:
```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## 💾 Database Location & Backup

The application stores all ledger records in an offline SQLite database (`joyce_restobar_ledger.db`):

| Operating System | Database File Location |
| :--- | :--- |
| **Windows** | `%APPDATA%\com.joycerestobar.ledger\joyce_restobar_ledger.db` |
| **macOS** | `~/Library/Application Support/com.joycerestobar.ledger/joyce_restobar_ledger.db` |
| **Linux** | `~/.local/share/com.joycerestobar.ledger/joyce_restobar_ledger.db` |

- **Hot Backup**: Navigate to **Settings > Database Backup & Restore > Backup Database** to save a timestamped copy anywhere (e.g. USB flash drive or cloud drive).
- **Safe Restore**: Use **Settings > Restore Database** to load a backup file. The app validates the database structure, flushes WAL logs, and safely restores all branches and transactions.

---

## 🔒 Default Credentials
- **Master Admin Security PIN**: `0000` *(Can be updated under Settings > Admin Security PIN)*
