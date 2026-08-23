import {
  Bell,
  CircleUserRound,
  House,
  MapPinned,
  WalletCards,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import { usePassengerExperience } from "../state/PassengerExperience";

const navItems = [
  { to: "/home", label: "Ana Sayfa", icon: House },
  { to: "/rides", label: "Yolculuklar", icon: MapPinned },
  { to: "/wallet", label: "Cüzdan", icon: WalletCards },
  { to: "/profile", label: "Profil", icon: CircleUserRound },
];
export function PassengerLayout() {
  const { user } = useAuth();
  const { state } = usePassengerExperience();
  const location = useLocation();
  const unread = state.notifications.filter((item) => !item.read).length;
  const showHeader = location.pathname === "/home";
  return (
    <div className="passenger-app">
      {showHeader && (
        <header className="passenger-header">
          <div className="passenger-identity">
            <div className="mini-avatar" aria-hidden="true">
              {(user?.email ?? user?.phone ?? "H").charAt(0).toUpperCase()}
            </div>
            <div>
              <span>Merhaba</span>
              <strong>{user?.email?.split("@")[0] ?? "Yolcu"}</strong>
            </div>
          </div>
          <NavLink
            to="/notifications"
            className="icon-button"
            aria-label={`${unread} okunmamış bildirim`}
          >
            <Bell size={20} />
            {unread > 0 && <b>{unread}</b>}
          </NavLink>
        </header>
      )}
      <main className="passenger-main">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Ana navigasyon">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}>
            <Icon size={21} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
