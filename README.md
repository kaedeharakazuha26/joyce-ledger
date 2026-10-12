# Joyce Restobar Ledger

An offline desktop ledger for Joyce Restobar. It records Sales, Expenses, LD Commission, Commission, Salary and Employees.
Built with Tauri 2, Rust, SQLite, React 18, TypeScript, Vite and Tailwind CSS.

## Prerequisites (one-time)

1. **Node.js 18+** (includes npm): https://nodejs.org
2. **Rust (stable)**: https://rustup.rs
3. **Tauri system dependencies** for your OS: https://v2.tauri.app/start/prerequisites/
   - Linux (Debian/Ubuntu): `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
   - Windows: Microsoft C++ Build Tools + WebView2 (already on Windows 10/11)
   - macOS: Xcode Command Line Tools (`xcode-select --install`)

## First run

```bash
npm install
npm run icons        # generates src-tauri/icons/* from src-tauri/app-icon.png (needed once)
npm run tauri dev    # start the desktop app in development mode
```

## Tests

```bash
npm run test:rust    # same as: cd src-tauri && cargo test
```

## Build installers

```bash
npm run tauri build
```

Installers are written to `src-tauri/target/release/bundle/`. Tauri builds for the OS you run it on, so build on Windows to get `.msi`/`.exe`, on macOS for `.dmg`/`.app`, and on Linux for `.deb`/`.rpm`/`.AppImage`. (A GitHub Actions matrix using `tauri-apps/tauri-action` can build all three.)

## Where is my data?

The SQLite file `joyce_restobar_ledger.db` is created on first launch in the app data directory:

| OS | Location |
|---|---|
| Windows | `%APPDATA%\com.joycerestobar.ledger\` |
| macOS | `~/Library/Application Support/com.joycerestobar.ledger/` |
| Linux | `~/.local/share/com.joycerestobar.ledger/` |

Use **Back up database** at the bottom of the sidebar to save a copy anywhere. To restore, close the app and replace the `.db` file with the backup. Delete any `-wal` and `-shm` files next to it before you replace it.

## Project layout

```
src-tauri/src/
  lib.rs              app setup, opens DB, registers commands
  error.rs            AppError (thiserror), serialized as a readable string
  money.rs            centavo parsing/formatting + CURRENCY_SYMBOL
  db/                 connection (pragmas) and migrations (PRAGMA user_version)
  models/             structs, input/filter types, validation
  commands/           sales, expenses, ld_commissions, commissions, salaries,
                      employees, suggestions (autocomplete), export (CSV + backup)
src/
  lib/                api.ts (invoke wrappers), money.ts, dates.ts
  types/models.ts     TS mirrors of the Rust structs
  hooks/              useRecords (generic CRUD), useSuggestions
  components/         Sidebar, AppLayout, DateInput, MoneyInput, TextInput,
                      DateRangeFilter, DataTable, Modal, ConfirmDialog, Toast,
                      EmptyState, RecordModule (shared record page)
  pages/              Sales, Expenses, LdCommission, Commission, Salary, Employees
```

## Manual test checklist

- [ ] Turn off Wi-Fi or unplug the network, then launch the app. It opens on **Sales** with no errors.
- [ ] The database file appears in the app data folder listed above.
- [ ] Each record form (Sales, Expenses, LD Commission, Commission, Salary) opens with today's date selected.
- [ ] The sidebar order is Sales, Expenses, LD Commission, Commission, Salary, Employees, and the active item is highlighted.
- [ ] The window cannot be resized below 1024 × 700.
- [ ] **Sales**: add "Food" ₱1,234.50. Pressing Enter in any field submits. A success toast appears, and the row shows `₱1,234.50`.
- [ ] Submit with empty fields: messages appear under Category and Amount, and nothing is saved.
- [ ] Amount `0`, `abc` or `1.234` is rejected with a clear message.
- [ ] Type "F" in Category: "Food" is suggested.
- [ ] **Edit**: click Edit. The form fills and shows "Editing". Change the amount and Save. The row updates.
- [ ] Click Edit, then press **Esc**. The form clears and leaves edit mode.
- [ ] **Delete**: click Delete and a confirmation appears. Cancel keeps the row. Delete removes it and shows a toast.
- [ ] **Filter**: add a record dated yesterday. It is hidden under "Today" and shown under "All dates" or a custom From/To.
- [ ] Setting From later than To shows an error.
- [ ] The **Total** equals the sum of the visible Amount column. On LD Commission, **Total quantity** equals the sum of Quantity.
- [ ] Rows are sorted newest date first, then by most recently added.
- [ ] With no rows in the range, an empty-state message is shown.
- [ ] **LD Commission**: Quantity `0` or `1.5` is rejected.
- [ ] **Employees**: add "Ana" / "Cashier". Adding "ana" again is rejected as a duplicate. Position can be left blank.
- [ ] On LD Commission, Commission and Salary, typing in Name suggests "Ana". Any other name can still be typed.
- [ ] Close the app and reopen it. All records are still there.
- [ ] **Export CSV** on each record page saves a file. It opens in Excel or LibreOffice with a TOTAL row, and ₱ is not needed because amounts are plain numbers.
- [ ] **Back up database** saves a `.db` file. Opening it with a SQLite viewer shows the same data.
- [ ] Switch the OS to dark mode. The app follows the system setting.
