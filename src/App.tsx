import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ToastProvider } from "./components/Toast";
import { CommissionPage } from "./pages/CommissionPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { LdCommissionPage } from "./pages/LdCommissionPage";
import { SalaryPage } from "./pages/SalaryPage";
import { SalesPage } from "./pages/SalesPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/ld-commission" element={<LdCommissionPage />} />
            <Route path="/commission" element={<CommissionPage />} />
            <Route path="/salary" element={<SalaryPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
