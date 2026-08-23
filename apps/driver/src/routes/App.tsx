import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate, AuthPage } from "@heytaksi/ui";
import { DriverLayout } from "../components/DriverLayout";
import { DriverProvider } from "../state/DriverContext";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { EarningsPage } from "../features/earnings/EarningsPage";
import { AccountPage } from "../features/account/AccountPage";
import { ActiveRidePage } from "../features/ride/ActiveRidePage";

function DriverApp() {
  return (
    <DriverProvider>
      <Routes>
        <Route element={<DriverLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/earnings" element={<EarningsPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>
        <Route path="/ride" element={<ActiveRidePage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </DriverProvider>
  );
}

export function App() {
  return (
    <AuthGate roles={["driver"]} fallback={<AuthPage audience="Sürücü" allowedRole="driver" />}>
      <DriverApp />
    </AuthGate>
  );
}
