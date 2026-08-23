import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate, AuthPage } from "@heytaksi/ui";
import { PassengerLayout } from "../components/PassengerLayout";
import { HomePage } from "../features/home/HomePage";
import { DestinationSearchPage } from "../features/home/DestinationSearchPage";
import { RidesPage } from "../features/rides/RidesPage";
import { RideDetailPage } from "../features/rides/RideDetailPage";
import { WalletPage } from "../features/wallet/WalletPage";
import { ProfilePage } from "../features/profile/ProfilePage";
import { ProfileSettingsPage } from "../features/profile/ProfileSettingsPage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";
import { PassengerExperienceProvider } from "../state/PassengerExperience";

function PassengerApp() {
  return (
    <PassengerExperienceProvider>
      <Routes>
        <Route element={<PassengerLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/rides" element={<RidesPage />} />
          <Route path="/rides/:rideId" element={<RideDetailPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:section" element={<ProfileSettingsPage />} />
        </Route>
        <Route path="/search" element={<DestinationSearchPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </PassengerExperienceProvider>
  );
}
export function App() {
  return (
    <AuthGate
      roles={["passenger"]}
      fallback={<AuthPage audience="Yolcu" allowedRole="passenger" />}
    >
      <PassengerApp />
    </AuthGate>
  );
}
