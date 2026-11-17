# Turso Multi-Laptop Sync & Black-Gold Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offline-capable multi-laptop Turso cloud database sync (supporting 3–10 concurrent laptops with per-device naming, local-only active branch, and conflict-free UUID sync) and upgrade the Dashboard with a 2×2 Black-Gold visual analytics grid (Cashflow Sankey, Net Profit Trend, Sales vs. Outflows Pacing, and Outflows Donut + Category Table).

**Architecture:** Each laptop keeps its fast synchronous `rusqlite` local database (`joyce_restobar_ledger.db`) so every read/write completes in `<1ms` and works offline. Schema migration `v5` adds `sync_id` (UUID/deterministic key), `device_name`, `local_settings` (device-local `active_branch`, `device_name`, `turso_url`, `turso_token`), and trigger-driven `sync_outbox` (`WITHOUT ROWID`). A Rust sync module (`src-tauri/src/db/sync.rs`) batches local changes to and from Turso's HTTP v2 pipeline (`/v2/pipeline`) via `ureq` on an 8-second background loop and on-demand commands, while the React frontend adds a Turso & Device Identity card in `SettingsPage.tsx`, a live sync indicator in `Sidebar.tsx`, and four custom SVG chart cards in `Charts.tsx` and `DashboardPage.tsx`.

**Tech Stack:** Rust (Tauri v2, `rusqlite` 0.32, `ureq` with `json` + `tls`, `serde`, `serde_json`), React 18, TypeScript, Tailwind CSS, custom SVG charts.

**Spec:** `docs/superpowers/specs/2026-11-17-turso-sync-and-dashboard-design.md`

## Global Constraints

- Preserve synchronous `rusqlite` operations and existing local `.db` Backup & Restore (`VACUUM INTO` and `rusqlite::backup::Backup`).
- Never sync `active_branch`, `device_name`, `turso_url`, or `turso_token` across laptops; store them in `local_settings` so one laptop switching branches never flips another laptop's active branch.
- Sync `admin_pin` via `app_settings` so PIN updates apply across all laptops, and require Admin PIN verification to save or disconnect Turso credentials.
- Use `WITHOUT ROWID` on `sync_outbox` so `AFTER INSERT` triggers never alter `conn.last_insert_rowid()`.
- Follow Hallmark & Ponytail rules: no external JS charting libraries, no `transition: all` in new components, crisp matte-black (`#0b0d13`) and gold/emerald/rose tokens, and accessible `:focus-visible` styles.

## Review Focus

- **Trigger `last_insert_rowid()` safety:** Inserting into `sync_outbox` inside an `AFTER INSERT` trigger on `sales`/`expenses`/etc. must not alter `conn.last_insert_rowid()` used by `create()` to fetch the newly created record; `sync_outbox` must be `WITHOUT ROWID`.
- **Per-device branch isolation:** Calling `set_active_branch` on Laptop A must update `local_settings` only and never queue an outbox change that changes Laptop B's `active_branch`.
- **Natural-key collision on offline `employees` and `categories`:** Two laptops offline creating the same category `("sales", "Food", "main")` or employee `("Maria", "main")` must merge cleanly on pull without failing with `UNIQUE constraint failed`.
- **Turso URL normalization:** Pasting `libsql://mydb-org.turso.io` or `https://mydb-org.turso.io/` with a trailing slash must normalize cleanly to `https://mydb-org.turso.io/v2/pipeline`.
- **Empty / single-day chart data:** All 4 new SVG charts (`CashflowSankeyCard`, `NetProfitTrendCard`, `SalesVsOutflowsCard`, `OutflowsDonutCard`) must render gracefully without `NaN` SVG coordinates when `dailyData` has 0 or 1 data points or when `totalSales` / `totalOutflows` is `0`.

---

### Task 0: Save Approved Spec & Plan Documents

**Files:**
- Create: `docs/superpowers/specs/2026-11-17-turso-sync-and-dashboard-design.md`
- Create: `docs/superpowers/plans/2026-11-17-turso-sync-and-dashboard-plan.md`

- [x] **Step 1: Write the approved design spec and implementation plan**

---

### Task 1: Schema Migration `v5` (`sync_id`, `local_settings`, and Trigger-Driven `sync_outbox`)

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/commands/admin.rs`
- Modify: `src-tauri/src/commands/export.rs`

- [x] **Step 1: Write tests in `src-tauri/src/db/migrations.rs` and `src-tauri/src/commands/admin.rs`**
- [x] **Step 2: Implement migration `v5` in `src-tauri/src/db/migrations.rs` and update `active_branch` storage in `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/admin.rs`, and `src-tauri/src/commands/export.rs`**
- [x] **Step 3: Verify migration `v5` and triggers via `node:sqlite` (`cargo` not installed locally)**

---

### Task 2: Turso HTTP v2 Pipeline Sync Engine & Multi-Laptop Concurrency Tests

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `ureq = "2.10"`)
- Create: `src-tauri/src/db/sync.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/error.rs`

- [x] **Step 1: Add `ureq` to `src-tauri/Cargo.toml` and `AppError::Sync(String)` to `src-tauri/src/error.rs`**
- [x] **Step 2: Implement `src-tauri/src/db/sync.rs`**
- [x] **Step 3: Write comprehensive unit tests in `src-tauri/src/db/sync.rs` (including 10-laptop concurrent & offline simulation)**
- [x] **Step 4: Verify 10-laptop sync convergence via `node:sqlite` (`cargo` not installed locally)**

---

### Task 3: Tauri Sync Commands, Background Worker & Frontend Sync API/Hooks

**Files:**
- Modify: `src-tauri/src/commands/admin.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/types/models.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/hooks/useRecords.ts`
- Modify: `src/context/BranchContext.tsx`

- [x] **Step 1: Add the 6 Tauri commands to `src-tauri/src/commands/admin.rs` and register them + the 8-second non-blocking background sync loop in `src-tauri/src/lib.rs`**
- [x] **Step 2: Add `SyncStatus` to `src/types/models.ts` and API functions to `src/lib/api.ts`**
- [x] **Step 3: Subscribe `useRecords.ts`, `useSuggestions.ts`, `RecordModule.tsx`, and `BranchContext.tsx` to `"sync-updated"`**
- [x] **Step 4: Audit Rust command signatures, types, and imports**

---

### Task 4: Settings Page Turso & Device Identity UI + Sidebar Live Sync Badge

**Files:**
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/components/Sidebar.tsx`

- [x] **Step 1: Add "Cloud Sync (Turso) & Multi-Laptop Setup" card and update System Info card in `src/pages/SettingsPage.tsx`**
- [x] **Step 2: Update `src/components/Sidebar.tsx` footer with Device Name and live sync badge**

---

### Task 5: Black-Gold 2×2 Dashboard Charts (`Charts.tsx` & `DashboardPage.tsx`)

**Files:**
- Modify: `src/components/Charts.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/EmployeesPage.tsx`

- [x] **Step 1: Implement `CashflowSankeyCard`, `NetProfitTrendCard`, `SalesVsOutflowsCard`, and `OutflowsDonutCard` in `src/components/Charts.tsx`**
- [x] **Step 2: Integrate the 2×2 Black-Gold visual grid into `src/pages/DashboardPage.tsx` and subscribe `DashboardPage.tsx` and `EmployeesPage.tsx` to `"sync-updated"`**
- [x] **Step 3: Verify TypeScript compilation (`tsc --noEmit`)**

---

### Task 6: Final Verification

- [x] **Step 1: Run `tsc --noEmit` (passed exit 0) and `node:sqlite` migration + 10-laptop sync convergence tests (passed)**
- [x] **Step 2: Update plan checkboxes and summarize local toolchain limits honestly**
