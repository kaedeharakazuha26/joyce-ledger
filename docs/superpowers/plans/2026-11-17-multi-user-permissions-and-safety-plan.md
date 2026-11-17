# Multi-User PINs, Role Permissions & Anti-Wipe Database Safety (v2.1.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-user PIN accounts with 7 granular permission flags (synced via Turso), a Black-Gold PIN Lock / Switch User screen, on-the-spot Admin PIN override for deletions, and triple-layer anti-wipe database safety (Owner-only reset + typing `RESET` + automatic pre-reset `.db` safety snapshots with 1-click undo), then release `v2.1.0`.

**Architecture:** Schema migration `v6` adds `app_users` with triggers queuing changes into `sync_outbox` for Turso cloud sync, seeded with the existing Admin PIN as the primary Owner account (`sync_id = 'user:owner'`). Rust backend commands in `admin.rs` enforce per-PIN permission checks (`can_delete_records` for deletions, `can_manage_settings` for admin/reset actions) and automatically run `VACUUM INTO` to save a timestamped local `.db` snapshot into `<app_data_dir>/safety_backups/` before any reset, branch delete, or restore. On the frontend, `AuthContext.tsx` provides a PIN Lock/Switch User screen and role-aware UI across `Sidebar.tsx`, `RecordModule.tsx`, `EmployeesPage.tsx`, `ConfirmDialog.tsx`, and `SettingsPage.tsx`.

**Tech Stack:** Rust (Tauri v2, `rusqlite` 0.32, `ureq` 2.10), React 18, TypeScript, Tailwind CSS, Node.js `node:sqlite` dev bridge.

**Spec:** `docs/superpowers/specs/2026-11-17-multi-user-permissions-and-safety-design.md`

---

### Task 0: Save Approved Spec & Plan Documents

- [x] **Step 1: Save the spec and implementation plan files**

### Task 1: Schema Migration `v6` (`app_users` Table + Triggers) & Turso Sync Integration

- [x] **Step 1: Add migration `v6` to `MIGRATIONS` in `src-tauri/src/db/migrations.rs`**
- [x] **Step 2: Add `app_users` sync support to `src-tauri/src/db/sync.rs` and `vite-sqlite-bridge.mjs`**

### Task 2: Backend User Management, Permission Checks & Automatic Pre-Reset Safety Backups

- [x] **Step 1: Add `UserAccount`, `UserInput`, and `SafetyBackupItem` models to `src-tauri/src/models/mod.rs`**
- [x] **Step 2: Update `check_pin`, add `check_admin_settings_pin`, automatic safety backups, and user/backup commands in `admin.rs`, `db/mod.rs`, `export.rs`, `lib.rs`, and `vite-sqlite-bridge.mjs`**

### Task 3: Frontend `AuthContext`, Black-Gold PIN Lock Screen & Permission Enforcement

- [x] **Step 1: Add TypeScript types and API wrappers in `src/types/models.ts` and `src/lib/api.ts`**
- [x] **Step 2: Create `src/context/AuthContext.tsx` with `AuthProvider`, `useAuth()`, and `PinLockScreen`**
- [x] **Step 3: Enforce permissions across `App.tsx`, `Sidebar.tsx`, `RecordModule.tsx`, `DataTable.tsx`, `EmployeesPage.tsx`, and `ConfirmDialog.tsx`**

### Task 4: Settings Page — User & Permission Manager + Safety Snapshots + `RESET` Gate

- [x] **Step 1: Add "User Accounts, PINs & Permissions" section and permission guard to `src/pages/SettingsPage.tsx`**
- [x] **Step 2: Add "Automatic Safety Snapshots (1-Click Undo)" and require typing `RESET` in Reset Database Modal in `src/pages/SettingsPage.tsx`**

### Task 5: Verification, Version Bump to `2.1.0` & GitHub Actions Release

- [x] **Step 1: Run `node:sqlite` tests verifying `v6`, user permissions, and safety snapshots**
- [x] **Step 2: Run `tsc --noEmit` and `vite build`**
- [x] **Step 3: Bump version to `2.1.0` across config files**
- [x] **Step 4: Commit, tag `v2.1.0`, push, and verify GitHub Actions release build passes**
