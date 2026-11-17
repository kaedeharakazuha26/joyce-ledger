import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ToastProvider } from "./components/Toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { BranchProvider } from "./context/BranchContext";
import { CommissionPage } from "./pages/CommissionPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { LdCommissionPage } from "./pages/LdCommissionPage";
import { SalaryPage } from "./pages/SalaryPage";
import { SalesPage } from "./pages/SalesPage";
import { SettingsPage } from "./pages/SettingsPage";

function AppRoutes() {
  const { currentUser } = useAuth();
  const canDashboard = !!currentUser?.canViewDashboard;
  const fallbackRoute = canDashboard ? "/dashboard" : "/sales";

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to={fallbackRoute} replace />} />
        <Route
          path="/dashboard"
          element={canDashboard ? <DashboardPage /> : <Navigate to="/sales" replace />}
        />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/ld-commission" element={<LdCommissionPage />} />
        <Route path="/commission" element={<CommissionPage />} />
        <Route path="/salary" element={<SalaryPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to={fallbackRoute} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BranchProvider>
        <AuthProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </AuthProvider>
      </BranchProvider>
    </ToastProvider>
  );
}
