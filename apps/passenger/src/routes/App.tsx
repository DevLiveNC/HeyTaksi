import { lazy, Suspense, useCallback, type PropsWithChildren } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate, AuthPage, MapsKeyProvider, useAuth } from "@heytaksi/ui";
import { PassengerLayout } from "../components/PassengerLayout";
import { HomePage } from "../features/home/HomePage";

import { RidesPage } from "../features/rides/RidesPage";
import { RideDetailPage } from "../features/rides/RideDetailPage";
import { WalletPage } from "../features/wallet/WalletPage";
import { WalletMethodsPage } from "../features/wallet/WalletMethodsPage";
import { WalletTopupPage } from "../features/wallet/WalletTopupPage";
import { ProfilePage } from "../features/profile/ProfilePage";
import { ProfileSettingsPage } from "../features/profile/ProfileSettingsPage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";
import { PassengerExperienceProvider } from "../state/PassengerExperience";
import { BookingProvider } from "../features/booking/BookingContext";
import { locationApi } from "../services/rideApi";
const DestinationSearchPage = lazy(() => import("../features/home/DestinationSearchPage").then((module) => ({ default: module.DestinationSearchPage })));
const RideBookingPage = lazy(() => import("../features/booking/RideBookingPage").then((module) => ({ default: module.RideBookingPage })));
const ActiveRidePage = lazy(() => import("../features/booking/ActiveRidePage").then((module) => ({ default: module.ActiveRidePage })));

function PassengerApp() {
  return (
    <PassengerExperienceProvider>
      <BookingProvider>
        <Suspense fallback={<div className="ride-loading"><span>HT</span><h1>Harita hazırlanıyor</h1></div>}>
        <Routes>
          <Route element={<PassengerLayout />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/rides" element={<RidesPage />} />
            <Route path="/rides/:rideId" element={<RideDetailPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/wallet/methods" element={<WalletMethodsPage />} />
            <Route path="/wallet/topup" element={<WalletTopupPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:section" element={<ProfileSettingsPage />} />
          </Route>
          <Route path="/search" element={<DestinationSearchPage />} />
          <Route path="/book" element={<RideBookingPage />} />
          <Route path="/ride/:id" element={<ActiveRidePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
        </Suspense>
      </BookingProvider>
    </PassengerExperienceProvider>
  );
}
function MapsBridge({ children }: PropsWithChildren) {
  const { authorizedFetch } = useAuth();
  const resolveKey = useCallback(
    () => locationApi.mapsConfig(authorizedFetch).then((config) => config.browserKey),
    [authorizedFetch],
  );
  return <MapsKeyProvider resolveKey={resolveKey}>{children}</MapsKeyProvider>;
}

export function App() {
  return (
    <AuthGate
      roles={["passenger"]}
      fallback={<AuthPage audience="Yolcu" allowedRole="passenger" redirectTo="/home" />}
    >
      <MapsBridge>
        <PassengerApp />
      </MapsBridge>
    </AuthGate>
  );
}
