import { Navigate, Route, Routes } from "react-router-dom";
import { useCallback, type PropsWithChildren } from "react";
import { AuthGate, AuthPage, MapsKeyProvider, useAuth } from "@heytaksi/ui";
import { DriverLayout } from "../components/DriverLayout";
import { DriverProvider, useDriver } from "../state/DriverContext";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { EarningsPage } from "../features/earnings/EarningsPage";
import { AccountPage } from "../features/account/AccountPage";
import { ActiveRidePage } from "../features/ride/ActiveRidePage";
import { RideOfferSheet } from "../features/offer/RideOfferSheet";
import { driverApi } from "../services/driverApi";

function RideOfferHost() {
  const { ride } = useDriver();
  if (!ride?.offerId) return null;
  return <RideOfferSheet />;
}

function DriverApp() {
  return (
    <DriverProvider>
      <RideOfferHost />
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

function MapsBridge({ children }: PropsWithChildren) {
  const { authorizedFetch } = useAuth();
  const resolveKey = useCallback(
    () => driverApi.mapsConfig(authorizedFetch).then((config) => config.browserKey),
    [authorizedFetch],
  );
  return <MapsKeyProvider resolveKey={resolveKey}>{children}</MapsKeyProvider>;
}

export function App() {
  return (
    <AuthGate roles={["driver"]} fallback={<AuthPage audience="Sürücü" allowedRole="driver" redirectTo="/dashboard" />}>
      <MapsBridge>
        <DriverApp />
      </MapsBridge>
    </AuthGate>
  );
}
