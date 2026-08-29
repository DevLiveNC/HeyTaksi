import { CalendarDays, CarFront, ChevronRight, Clock3, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import type { RideHistoryFilter, RideHistoryItem, RideStatus } from "@heytaksi/shared";
import { rideApi } from "../../services/rideApi";

const filters: { value: RideHistoryFilter; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "completed", label: "Tamamlandı" },
  { value: "cancelled", label: "İptal" },
  { value: "upcoming", label: "Aktif" },
];
const statusLabel: Record<RideStatus, string> = {
  searching: "Aranıyor",
  driver_assigned: "Atandı",
  driver_arriving: "Geliyor",
  driver_arrived: "Geldi",
  started: "Başladı",
  in_progress: "Yolda",
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
};
const formatWhen = (value: string) =>
  new Date(value).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function RidesPage() {
  const auth = useAuth();
  const [filter, setFilter] = useState<RideHistoryFilter>("all");
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    rideApi
      .list(auth.authorizedFetch, { status: filter })
      .then((next) => {
        if (alive) setRides(next);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Yolculuklar yüklenemedi"))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [auth.authorizedFetch, filter]);

  return (
    <div className="sub-page rides-page">
      <header className="page-title">
        <span>YOLCULUK ARŞİVİ</span>
        <h1>Yolculukların</h1>
        <p>Tüm hareketlerin tek yerde.</p>
      </header>
      <div className="filter-tabs" role="tablist" aria-label="Yolculuk durumu">
        {filters.map((item) => (
          <button
            role="tab"
            aria-selected={filter === item.value}
            className={filter === item.value ? "active" : ""}
            key={item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error && <div className="booking-error">{error}</div>}
      <div className="ride-list">
        {rides.map((ride) => (
          <Link to={`/rides/${ride.id}`} className="ride-card" key={ride.id}>
            <div className="ride-card-head">
              <span>
                <CalendarDays size={14} />
                {formatWhen(ride.createdAt)}
              </span>
              <em className={`status-${ride.status === "completed" || ride.status === "cancelled" ? ride.status : "upcoming"}`}>
                {statusLabel[ride.status]}
              </em>
            </div>
            <div className="full-route">
              <div className="route-dots">
                <i />
                <span />
                <i />
              </div>
              <div>
                <span>
                  Nereden<strong>{ride.pickupAddress}</strong>
                </span>
                <span>
                  Nereye<strong>{ride.destinationAddress}</strong>
                </span>
              </div>
            </div>
            <footer>
              <span>
                <CarFront size={17} />
                <span>
                  <strong>{ride.driverName ?? "Sürücü bekleniyor"}</strong>
                  <small>{ride.vehicle ?? ride.vehicleType}</small>
                </span>
              </span>
              <b>₺{Number(ride.finalFare ?? ride.estimatedFare).toFixed(2)}</b>
              <ChevronRight size={18} />
            </footer>
          </Link>
        ))}
        {!loading && rides.length === 0 && (
          <div className="empty-list">
            <MapPin />
            <h2>Henüz yolculuk yok</h2>
            <p>Bu durumdaki yolculukların burada görünecek.</p>
            <Clock3 />
          </div>
        )}
      </div>
    </div>
  );
}
