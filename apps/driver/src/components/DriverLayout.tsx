import { CircleDollarSign, LayoutDashboard, CircleUserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useDriver } from "../state/DriverContext";

const navItems = [
  { to: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { to: "/earnings", label: "Kazanç", icon: CircleDollarSign },
  { to: "/account", label: "Hesap", icon: CircleUserRound },
];

const availabilityLabels: Record<string, string> = {
  offline: "Çevrim dışı",
  online: "Çevrim içi",
  available: "Müsait",
  on_trip: "Yolculukta",
  paused: "Mola",
};

export function DriverLayout() {
  const { dashboard, connection } = useDriver();
  const availability = dashboard?.availability ?? "offline";
  return (
    <div className="driver-app">
      <header className="driver-topbar">
        <div className="brand-mark" aria-hidden="true">HT</div>
        <div>
          <strong>Hey Taksi Sürücü</strong>
          <small>{dashboard?.vehicle ? `${dashboard.vehicle.brand} ${dashboard.vehicle.model} · ${dashboard.vehicle.plate}` : "Araç atanmadı"}</small>
        </div>
        <span className={`status-pill ${availability}`} data-connection={connection}>
          <i />
          {availabilityLabels[availability] ?? availability}
        </span>
      </header>
      <main className="driver-main">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Sürücü menüsü">
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
