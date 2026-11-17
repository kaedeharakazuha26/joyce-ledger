# Design Document: Multi-User PINs, Permissions & Database Safety (v2.1.0)

**Date:** 2026-11-17  
**Project:** Joyce Restobar & Lounge — Ledger & Financial Management System  
**Status:** Approved

---

## 1. Intent & Why
Joyce Restobar needs multiple staff members (Owners, Managers, Cashiers, Encoders) across 3–10 laptops to unlock the app with their own personal PIN, have strict per-user permissions (e.g. a cashier who can enter records but **cannot** delete entries, view executive profit reports, or touch Settings), and have bulletproof safeguards so no employee—or accidental admin click—can ever permanently wipe the database.

## 2. Goals, Non-Goals & Anti-Goals
- **Goals:**
  - Support multiple user accounts (`app_users`), each with a unique PIN, role preset (*Owner*, *Manager*, *Cashier*, *Custom*), optional branch lock, and 7 individual permission checkboxes, synced across all laptops via Turso.
  - Show a Black-Gold **PIN Lock Screen** on app launch (and when clicking **Switch User / Lock** in the sidebar).
  - Enforce permissions in both the UI and the Rust backend:
    - Users without `can_delete_records` cannot delete rows with their PIN (an Owner/Manager can enter their PIN in the confirmation box for a one-time override).
    - Users without `can_edit_records` have Edit buttons disabled/hidden.
    - Users without `can_view_dashboard` default directly to **Sales** and cannot view the profit Dashboard.
    - Users without `can_manage_settings` cannot access Settings, change Turso config, manage users, or reset data.
  - Tag every created/updated record with `"LaptopName (UserName)"` (when `active_user_name` is set) so both device and staff member are tracked.
  - **Automatic Pre-Reset Safety Snapshots:** Automatically save a timestamped local `.db` backup in `safety_backups/` before any Reset Database, Delete Branch, or Restore operation, with a **1-Click Restore Snapshot** list in Settings, plus require typing `RESET` + an Owner PIN to reset data.
- **Non-Goals:**
  - No email/password cloud login required (fast 4+ digit/character PINs work 100% offline and sync via Turso).
- **Anti-Goals:**
  - Never allow the last Owner account to be deleted or stripped of Admin permissions (preventing accidental lockout).
  - Never allow a non-Owner PIN to authorize `reset_database`, `delete_branch`, `restore_database`, or Turso disconnect.

## 3. Approaches Considered
1. **Approach 1 (Chosen): Synced `app_users` Table with Role Presets + Custom Permission Checkboxes + PIN Lock Screen + Auto Pre-Reset Safety Snapshots**
2. **Approach 2: Fixed 3-Role System Only** — Rejected: cannot customize individual permissions per staff member.
3. **Approach 3: Per-Action PIN Prompt Only (No Lock Screen)** — Rejected: leaves Dashboard profits/salaries exposed and lacks active user attribution.

## 4. Detailed Design
- **Migration `v6`:** Adds `app_users` table + triggers syncing into `sync_outbox`, seeds `user:owner` from `app_settings.admin_pin`, and adds `active_user_name` to `local_settings`.
- **Rust Backend Enforcement & Safety Snapshots:** `check_pin` verifies `can_delete_records || can_manage_settings`; `check_admin_settings_pin` verifies `can_manage_settings`; `create_auto_safety_backup` runs `VACUUM INTO` before destructive operations and retains up to 10 snapshots in `safety_backups/`.
- **Frontend Auth & Settings UI:** `AuthContext.tsx` renders `PinLockScreen`, enforces permissions across `Sidebar.tsx`, `RecordModule.tsx`, `DataTable.tsx`, `EmployeesPage.tsx`, `ConfirmDialog.tsx`, and `SettingsPage.tsx` (User Accounts manager + Automatic Safety Snapshots + `RESET` confirmation gate).
