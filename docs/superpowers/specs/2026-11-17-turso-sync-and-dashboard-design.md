# Design Document: Turso Multi-Laptop Sync & Black-Gold Dashboard

**Date:** 2026-11-17  
**Project:** Joyce Restobar & Lounge — Ledger & Financial Management System  
**Status:** Approved

---

## 1. Intent & Why
Joyce Restobar needs **3 to 10 laptops** across one or more branches to enter and view ledger data (Sales, Expenses, LD Commissions, Commissions, Salaries, Employees, Categories, and Branches) at the same time—even when restobar Wi-Fi is unstable or temporarily offline—without SQLite database locks, ID collisions, or laptops flipping each other's active branch. Alongside this, the Dashboard will adopt a sleek **Black-Gold 2×2 visual analytics layout** inspired by the reference design (without the chat panel) using Joyce Restobar's ledger terminology.

## 2. Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Support 3–10 concurrent laptops entering data simultaneously (online or offline) with zero lock errors and zero overwritten rows.
  - Add a **Cloud Sync (Turso) & Multi-Laptop Setup** section in `src/pages/SettingsPage.tsx` for **Device Name**, **Turso Database URL** (`libsql://...` or `https://...`), **Auth Token**, **Test Connection**, and **Sync Now**.
  - Show live sync status (`Synced`, `Syncing…`, `Offline — X pending`, or `Local Only`) in `src/components/Sidebar.tsx` and `src/pages/SettingsPage.tsx`.
  - Keep one shared Turso database for all branches (scoped by `branch_id`), while keeping `active_branch` and `device_name` strictly local to each laptop.
  - Upgrade `src/pages/DashboardPage.tsx` and `src/components/Charts.tsx` with the 2×2 Black-Gold chart grid above the Staff Earnings section.
- **Non-Goals:**
  - No AI chat sidebar panel (explicitly excluded).
  - No separate Turso database required per branch (one database handles all branches via `branch_id`).
- **Anti-Goals (What would make this a failure even if it works):**
  - Any "Save" button hanging or slowing down when Wi-Fi is weak or disconnected.
  - Laptop A switching branches in the sidebar causing Laptop B's screen to switch branches.
  - Two offline laptops saving records with the same auto-increment `id` and overwriting each other when reconnecting.
  - Breaking existing local `.db` file Backup & Restore.

## 3. Constraints
- Must preserve existing synchronous `rusqlite` speed and local `.db` backup/restore in `src-tauri/src/commands/export.rs`.
- Must build cleanly on Windows without requiring external CMake/LLVM toolchains.
- Follow workspace **Ponytail** & **Hallmark** rules: zero heavy frontend chart dependencies (use custom React + SVG), matte-black & gold tokens, no `transition: all`, and accessible `:focus-visible` states.

## 4. Approaches Considered
1. **Approach 1 (Chosen): Local `rusqlite` + Turso HTTP v2 Pipeline Sync Engine (`sync_id` UUIDs) + Custom SVG Charts**
   - *Pros:* `<1ms` local saves, 100% offline-capable, zero lock contention across 10 laptops, preserves local Backup/Restore, clean Windows build.
   - *Cons:* Custom Rust sync engine and schema migration `v5`.
2. **Approach 2: Replace `rusqlite` with `libsql` Embedded Replica SDK + `recharts`**
   - *Rejected because:* Offline concurrent writes across 10 laptops still collide on `INTEGER PRIMARY KEY`, requires CMake/clang on Windows, and breaks `rusqlite::backup`.
3. **Approach 3: Live Dual-Write on Save**
   - *Rejected because:* Slow or flaky Wi-Fi would freeze every "Save" click waiting for network timeouts.

## 5. Detailed Design

### A. Database Schema Migration `v5` (`src-tauri/src/db/migrations.rs`)
1. **Per-Row Sync Metadata:**
   - Add `sync_id TEXT`, `updated_at TEXT`, and `device_name TEXT` to synced tables (`sales`, `expenses`, `ld_commissions`, `commissions`, `salaries`, `employees`, `categories`, `branches`), with a unique index on `sync_id`.
   - Seeded default rows (`main`, `branch_2`, and default categories) get deterministic `sync_id`s (e.g. `branch:main`, `cat:main:sales:food`) so all 10 laptops recognize them as the same records instead of duplicating defaults.
2. **Local Device Settings (`local_settings` table — never synced to Turso):**
   - Stores `device_name`, `active_branch` (migrated from `app_settings`), `turso_url`, `turso_token`, `sync_enabled`, `last_sync_at`, `last_sync_cursor`, and `last_sync_error`.
   - `admin_pin` remains in `app_settings` and syncs via Turso so admin PIN changes apply across all laptops.
3. **Conflict-Free Outbox & Deletions (`sync_outbox` `WITHOUT ROWID`):**
   - SQLite triggers (`AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE`) automatically queue local changes into `sync_outbox` when `sync_applying_remote = 0`.
   - Because `sync_outbox` is `WITHOUT ROWID`, `AFTER INSERT` triggers never overwrite `conn.last_insert_rowid()`.
   - When a record is deleted locally, `sync_outbox` records an `'DELETE'` tombstone entry for that `sync_id` so the other 9 laptops delete that exact `sync_id` on their next pull.

### B. Turso HTTP Pipeline Sync Service (`src-tauri/src/db/sync.rs`)
- Normalizes `libsql://...` URLs to `https://.../v2/pipeline` using `ureq` (pure Rust TLS, zero system DLL issues).
- **On Connect / Schema Init:** Ensures remote Turso tables + `turso_sync_log` table exist.
- **Push step:** Reads pending items from `sync_outbox` in batches, sends idempotent `INSERT ... ON CONFLICT(sync_id) DO UPDATE` + tombstone entries to Turso, and clears pushed items from `sync_outbox`.
- **Pull step:** Queries remote `turso_sync_log` where `seq > last_sync_cursor`, applies upserts/deletes inside a local transaction with `sync_applying_remote = 1`, updates `last_sync_cursor`, and emits a `"sync-updated"` Tauri event so open React pages refresh automatically.
- **Cadence:** Runs automatically in a background thread every **8 seconds** when configured (without holding the `DbState` mutex during network I/O), and on demand via **"Sync Now"**.

### C. Settings & Sidebar UI (`SettingsPage.tsx` & `Sidebar.tsx`)
- **Settings Card ("Cloud Sync (Turso) & Multi-Laptop Setup"):**
  - **Device Name** input (e.g., `"Main Cashier Laptop"`, `"Branch 2 Desk"`).
  - **Turso Database URL** (`libsql://your-db.turso.io`) & **Auth Token** (with show/hide toggle).
  - **Status Banner:** Shows connection state (`Connected & Synced`, `Offline — X changes queued locally`, or `Local Offline Mode`), last synced timestamp, and pending outbox count.
  - **Actions:** `Test Connection`, `Save & Connect Turso`, `Sync Now`, and `Disconnect` (PIN-protected).
- **Sidebar Footer Indicator:**
  - Displays the laptop's **Device Name** and live sync dot (`Turso Synced`, `Pending Sync (N)` when offline, or `Local Mode`).

### D. Black-Gold 2×2 Dashboard Layout (`DashboardPage.tsx` & `Charts.tsx`)
Styled in matte-black (`#0b0d13`) cards with subtle gold/slate borders (`border-amber-500/20`) and crisp typography:
1. **Top-Left Card — `Cashflow` (Sankey Flow Diagram):**
   - Left column: **Sales Categories** (`Food`, `Drinks`, `Beer`, `Liquor`, `Cocktails`, etc.) with amounts.
   - Center node: **Gross Sales** (`₱...`) vertical gold/emerald bar.
   - Right column: Smooth curved SVG ribbons splitting into **Operating Expenses**, **LD Commissions**, **Commissions**, **Salaries Paid**, and **Net Profit / Surplus** (when positive).
2. **Top-Right Card — `Net Profit` (Cumulative Trend Line Chart):**
   - Header shows big **Net Profit** (`₱...`) and **Profit Margin %** badge.
   - Smooth SVG step/area line tracking cumulative Net Profit across the selected date range (emerald when positive, rose when negative).
3. **Bottom-Left Card — `Sales vs. Outflows` (Cumulative Pacing Line Chart):**
   - Header compares **Gross Sales** (`₱...`) vs. **Total Outflows** (`₱...`).
   - Dual SVG cumulative trend lines (Gold/Emerald for Sales, Rose for Outflows) across the date range with hover inspection.
4. **Bottom-Right Card — `Outflows` (Donut Ring + Category Breakdown Table):**
   - Thin multi-segment SVG Donut Ring with `Total Outflows ₱...` centered inside the ring.
   - Below the ring: `CATEGORIES | VALUE | WEIGHT` table listing individual Expense categories plus `Salaries Paid`, `LD Commissions`, and `Regular Commissions` with their exact `₱` amount and `%` share of total outflows.
5. **Below the 2×2 Grid:**
   - Retains the existing **Executive KPI Summary Strip**, **Staff Earnings & Payout Ranking**, **Staff Payout Summary Table**, and **Print Report** modal.

## 6. Builder Calls Made
- **PIN Protection for Changing Turso Credentials:** Saving or disconnecting Turso URL/Token in Settings requires the **Admin PIN** (default `0000`) so cashiers cannot tamper with the database connection.
- **Natural-Key Merge for Employees & Categories:** If two laptops offline at the same time both add an employee or category with the same name in the same branch, they merge cleanly by natural key (`(branch_id, lower(name))` / `(branch_id, lower(kind), lower(name))`) instead of failing with a duplicate error.
- **Keep Existing Printable Audit Reports Intact:** The print/PDF layout in `DashboardPage.tsx` stays intact so physical audit printouts continue to work as before.
