import { BadgeCheck, CarFront, CirclePercent, Star, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@heytaksi/ui";
import { useDriver } from "../../state/DriverContext";

const availabilityLabels: Record<string, string> = {
  offline: "Çevrim dışı",
  online: "Çevrim içi",
  available: "Müsait",
  on_trip: "Yolculukta",
  paused: "Mola",
};

/** Sürücü hesabı: profil, araç, hizmet istatistikleri ve güvenli çıkış. */
export function AccountPage() {
  const { user, logout } = useAuth();
  const { dashboard, connection } = useDriver();
  return (
    <div className="account-page">
      <section className="profile-card">
        <div className="profile-avatar">
          {(user?.email ?? user?.phone ?? "S").charAt(0).toUpperCase()}
        </div>
        <small>HEY TAKSİ SÜRÜCÜSÜ</small>
        <h2>{user?.email ?? user?.phone}</h2>
        <p>
          {dashboard?.verificationStatus === "verified" ? (
            <span className="verified"><BadgeCheck size={13} /> Doğrulanmış sürücü</span>
          ) : (
            "Doğrulama beklemede; çevrim içi olmak için belgelerinin onaylanması gerekir."
          )}
        </p>
        <div className="account-stats">
          <div>
            <Star size={14} />
            <strong>{(dashboard?.rating ?? 0).toFixed(2)}</strong>
            <small>Puan</small>
          </div>
          <div>
            <CarFront size={14} />
            <strong>{dashboard?.totalRides ?? 0}</strong>
            <small>Yolculuk</small>
          </div>
          <div>
            <CirclePercent size={14} />
            <strong>%{(dashboard?.acceptanceRate ?? 0).toFixed(0)}</strong>
            <small>Kabul</small>
          </div>
        </div>
      </section>

      {dashboard?.vehicle && (
        <section className="vehicle-card">
          <small>ARACIM</small>
          <h3>{dashboard.vehicle.brand} {dashboard.vehicle.model}</h3>
          <p>{dashboard.vehicle.color} · {dashboard.vehicle.plate}</p>
          <em>{dashboard.vehicle.vehicleType === "standard" ? "Standart taksi"
            : dashboard.vehicle.vehicleType === "comfort" ? "Comfort"
            : dashboard.vehicle.vehicleType === "xl" ? "XL" : "Erişilebilir"}</em>
        </section>
      )}

      <section className="status-lines">
        <div>
          <span>Durum</span>
          <strong>{availabilityLabels[dashboard?.availability ?? "offline"]}</strong>
        </div>
        <div>
          <span>Realtime bağlantı</span>
          <strong>{connection === "live" ? "Canlı" : connection === "connecting" ? "Bağlanıyor" : "Kesik"}</strong>
        </div>
        <div>
          <span>Toplam yolculuk</span>
          <strong>{dashboard?.totalRides ?? 0}</strong>
        </div>
        <div>
          <span>İptal oranı</span>
          <strong>%{(dashboard?.cancellationRate ?? 0).toFixed(0)}</strong>
        </div>
      </section>

      <div className="safety-chip">
        <ShieldCheck size={14} /> Yolculuklar güvenlik sistemiyle izlenir
      </div>

      <button className="logout-button" onClick={() => void logout()}>
        <LogOut size={16} /> Güvenli çıkış
      </button>
    </div>
  );
}
