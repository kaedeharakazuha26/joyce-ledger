# Joyce Restobar & Lounge — Ledger & Financial Management System

An offline-first, high-performance desktop ledger and financial reporting system engineered specifically for **Joyce Restobar & Lounge**. Built with **Tauri 2**, **Rust**, **SQLite**, **React 18**, **TypeScript**, **Vite**, and **Tailwind CSS**.

---

## 🌟 Key Features & How the App Works

### 1. Multi-Branch Operations
- **Branch Switcher**: Instantly switch between branches (e.g. *Main Branch*, *Beachfront Branch*, etc.) from the sidebar.
- **Isolated Branch Data**: All transactions (Sales, Expenses, LD Commissions, Commissions, Salaries, and Employees) are partitioned by branch.
- **Branch Management**: Create new branches, rename existing branches, or delete branches (with automated cascade protection and admin authorization).

### 2. Interactive Financial Dashboard & Visual Analytics
- **Executive KPIs**: Real-time summary cards for **Gross Sales**, **Total Outflows** (Expenses + Staff Payouts), **Net Operating Profit**, and **Profit Margin %**.
- **Daily Financial Cash Flow Chart**: Dual-bar chart contrasting daily sales against operational outflows, featuring interactive hover tooltips that dynamically adjust to prevent clipping.
- **Staff Earnings & Payout Ranking**: Visual leaderboard ranking employees by total payouts, drink counts, commissions, and salaries.
- **Category Breakdowns**: Distribution bars showing percentage share and volume for sales and expense categories.
- **Flexible Date Filtering**: Filter analytics by *Today*, *Yesterday*, *This Week*, *This Month*, *This Year*, or any custom *Date Range*.

### 3. Print & PDF Audit Report Engine
Clicking **"Print Report"** opens a customizable report generator:
- **Comprehensive Audit Dossier (All-in-One)**: Full management packet containing the Executive Financial Summary, Category Margin Breakdowns, Staff Earnings Ranking, and Daily Cash Flows.
- **Staff Earnings & Payout Ranking Report**: Official payroll ledger detailing staff ranks, drink quantities, LD commissions, sales commissions, base salaries, and individual totals.
- **Daily Financial Cash Flows Statement**: Chronological day-by-day inflow, outflow, and net margin statement.
- **Executive Financial Statement**: High-level profit & loss report with category distribution.
- **Official Print Styling**: Automatically suppresses screen navigation, applies clean black-and-white print contrast, embeds the official Joyce Restobar crest, branch header, date period, and auditor sign-off lines (*Prepared by*, *Verified by*, *Approved by*).

### 4. Ledger Modules & Transaction Entry
- **Sales Ledger**: Track orders and revenues. Features category selection with an instant "+ Add Category" modal.
- **Operating Expenses**: Track inventory, utilities, maintenance, and supplies with categorized tagging.
- **LD Commission (Ladies' Drink)**: Track drink quantities and commissions per staff member, with employee dropdown selectors tied to the employee roster.
- **Commissions & Base Salary**: Track sales commissions, bonuses, and fixed staff payroll disbursements.
- **Employee Roster**: Register active staff and positions (Cashier, Bartender, Server, PR, etc.).

### 5. Security & Settings
- **Admin PIN Protection**: High-security actions (Branch Deletion, Branch Data Reset, Record Deletion) require the Master Admin PIN (default: `0000`).
- **Change Admin PIN**: Secure PIN update workflow requiring previous PIN verification.
- **Live Database Backup & Restore**: Hot SQLite backup to any directory, plus safe atomic database restore with WAL flush and schema migration check.

---

## 📁 Project Structure

```text
ledger-app-react-rust/
├── .github/
│   └── workflows/
│       └── release.yml          # Automated CI/CD: builds Linux AppImage/deb, Mac dmg, Windows msi/exe
├── src/                         # Frontend Application (React 18 + TypeScript + Vite)
│   ├── assets/                  # Brand assets (logo.webp, icons)
│   ├── components/              # Reusable UI component library
│   │   ├── AppLayout.tsx        # Shell layout, navigation bar, and page headers
│   │   ├── Charts.tsx           # CashFlowChart, StaffRankChart, CategoryBreakdown
│   │   ├── ConfirmDialog.tsx    # Modal confirmation dialogues
│   │   ├── DataTable.tsx        # High-performance sorted data grid with totals
│   │   ├── DateInput.tsx        # Form date picker
│   │   ├── DateRangeFilter.tsx  # Preset and custom date range filter component
│   │   ├── EmptyState.tsx       # Zero-state illustration placeholders
│   │   ├── Modal.tsx            # Accessible modal dialog container
│   │   ├── MoneyInput.tsx       # Currency formatting input (PHP ₱)
│   │   ├── RecordModule.tsx     # Generic CRUD view for Sales, Expenses, Salaries, etc.
│   │   ├── Sidebar.tsx          # Navigation sidebar with branch switcher & brand logo
│   │   ├── TextInput.tsx        # Form text inputs with autocomplete datalist
│   │   └── Toast.tsx            # Floating feedback notifications
│   ├── context/
│   │   └── BranchContext.tsx    # Global active branch state and branch management
│   ├── hooks/
│   │   ├── useRecords.ts        # Generic transaction hook (fetch, add, edit, delete, CSV export)
│   │   └── useSuggestions.ts    # Autocomplete suggestion hook
│   ├── lib/
│   │   ├── api.ts               # Typed Tauri IPC command wrappers
│   │   ├── dates.ts             # Date range utilities, presets, and formatting
│   │   └── money.ts             # Centavo-safe integer currency math and PHP ₱ formatting
│   ├── pages/                   # Main Application Views
│   │   ├── DashboardPage.tsx    # Analytics, visual charts, and printable report modal
│   │   ├── SalesPage.tsx        # Sales ledger view
│   │   ├── ExpensesPage.tsx     # Operating expenses ledger view
│   │   ├── LdCommissionPage.tsx # Ladies' Drink commission tracker
│   │   ├── CommissionPage.tsx   # Staff sales commission view
│   │   ├── SalaryPage.tsx       # Staff salary ledger view
│   │   ├── EmployeesPage.tsx    # Staff roster management view
│   │   └── SettingsPage.tsx     # Security PIN, Branch management, Backup & Restore
│   ├── types/
│   │   └── models.ts            # TypeScript interfaces matching Rust structs
│   ├── App.tsx                  # Client-side router and route definitions
│   ├── index.css                # Tailwind CSS, custom design tokens, @media print rules
│   └── main.tsx                 # React DOM mount point
├── src-tauri/                   # Desktop Backend (Rust + Tauri v2)
│   ├── icons/                   # Multi-resolution application icons (.ico, .icns, .png)
│   ├── src/
│   │   ├── commands/            # Tauri IPC command handlers
│   │   │   ├── admin.rs         # PIN verification, branch CRUD, and branch reset
│   │   │   ├── commissions.rs   # Commission CRUD operations
│   │   │   ├── employees.rs     # Employee CRUD operations
│   │   │   ├── expenses.rs      # Expense CRUD operations
│   │   │   ├── export.rs        # CSV streaming and SQLite database backup/restore
│   │   │   ├── ld_commissions.rs# LD commission CRUD operations
│   │   │   ├── salaries.rs      # Salary CRUD operations
│   │   │   ├── sales.rs         # Sales CRUD operations
│   │   │   └── suggestions.rs   # Category and name autocomplete queries
│   │   ├── db/
│   │   │   ├── connection.rs    # SQLite pool initialization with WAL pragmas
│   │   │   └── migrations.rs    # Incremental SQLite database schema migrations
│   │   ├── error.rs             # Centralized AppError enum (thiserror)
│   │   ├── lib.rs               # Tauri plugin registration & builder entrypoint
│   │   ├── main.rs              # Desktop executable main entrypoint
│   │   ├── models/              # Rust domain models, validations, and filters
│   │   └── money.rs             # Exact integer centavo math utilities
│   ├── Cargo.toml               # Rust dependencies and compiler optimization profiles
│   └── tauri.conf.json          # Tauri window configuration, bundle settings, and capabilities
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
