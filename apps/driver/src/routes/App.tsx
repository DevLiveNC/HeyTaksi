import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, useCallback, type PropsWithChildren } from "react";
import { AuthGate, AuthPage, DeviceLocationProvider, LocationPermissionGate, MapsKeyProvider, useAuth } from "@heytaksi/ui";
import { DriverLayout } from "../components/DriverLayout";
import { DriverProvider, useDriver } from "../state/DriverContext";
import { EarningsPage } from "../features/earnings/EarningsPage";
import { AccountPage } from "../features/account/AccountPage";
import { RideOfferSheet } from "../features/offer/RideOfferSheet";
import { driverApi } from "../services/driverApi";

const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ActiveRidePage = lazy(() => import("../features/ride/ActiveRidePage").then((module) => ({ default: module.ActiveRidePage })));

function RideOfferHost() {
  const { ride } = useDriver();
  if (!ride?.offerId) return null;
  return <RideOfferSheet />;
}

function DriverApp() {
  return (
    <DeviceLocationProvider>
      <DriverProvider>
        <LocationPermissionGate audience="driver" />
        <RideOfferHost />
        <Suspense fallback={<div className="ride-loading"><span>HT</span><h1>Harita hazırlanıyor</h1></div>}>
        <Routes>
          <Route element={<DriverLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/earnings" element={<EarningsPage />} />
            <Route path="/account" element={<AccountPage />} />
          </Route>
          <Route path="/ride" element={<ActiveRidePage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </DriverProvider>
    </DeviceLocationProvider>
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
