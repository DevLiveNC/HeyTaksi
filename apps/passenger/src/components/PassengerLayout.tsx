import {
  Bell,
  CircleUserRound,
  House,
  MapPinned,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import { passengerApi } from "../services/passengerApi";

const navItems = [
  { to: "/home", label: "Ana Sayfa", icon: House },
  { to: "/rides", label: "Yolculuklar", icon: MapPinned },
  { to: "/wallet", label: "Cüzdan", icon: WalletCards },
  { to: "/profile", label: "Profil", icon: CircleUserRound },
];
export function PassengerLayout() {
  const { user, authorizedFetch } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const showHeader = location.pathname === "/home";
  useEffect(() => {
    let alive = true;
    passengerApi
      .notifications(authorizedFetch)
      .then((items) => {
        if (alive) setUnread(items.filter((item) => !item.read).length);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [authorizedFetch, location.pathname]);
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
          <NavLink to="/notifications" className="icon-button" aria-label={`${unread} okunmamış bildirim`}>
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
