import {
  ArrowRight,
  BriefcaseBusiness,
  ChevronRight,
  Clock3,
  Home,
  MapPin,
  Search,
  Star,
  UserRound,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import { KKTC_OUTSIDE_LOCATION_MESSAGE, type RideHistoryItem } from "@heytaksi/shared";
const MapCanvas = lazy(() => import("./MapCanvas").then((module) => ({ default: module.MapCanvas })));
import { usePassengerExperience, type Address } from "../../state/PassengerExperience";
import { useCurrentLocation } from "../../hooks/useCurrentLocation";
import { useNearbyDrivers } from "../../hooks/useNearbyDrivers";
import { rideApi } from "../../services/rideApi";

const addressIcon = (type: Address["type"]) =>
  type === "home" ? <Home /> : type === "work" ? <BriefcaseBusiness /> : <Star />;

const formatWhen = (value: string) =>
  new Date(value).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function HomePage() {
  const { addresses } = usePassengerExperience();
  const navigate = useNavigate();
  const auth = useAuth();
  const geo = useCurrentLocation();
  const { drivers, closestEtaSeconds } = useNearbyDrivers(geo.location);
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [active, setActive] = useState<RideHistoryItem | null>(null);
  const waitLabel =
    closestEtaSeconds != null
      ? `En yakın taksi ${Math.max(1, Math.round(closestEtaSeconds / 60))} dk`
      : "Yakında taksi aranıyor";

  useEffect(() => {
    let alive = true;
    Promise.all([rideApi.list(auth.authorizedFetch, { limit: 4 }), rideApi.current(auth.authorizedFetch)])
      .then(([history, current]) => {
        if (!alive) return;
        setRides(history);
        setActive(current);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [auth.authorizedFetch]);

  return (
    <div className="home-page">
      <div className={`location-kicker ${geo.blocked || geo.outsideServiceArea ? "needs-permission" : ""}`}>
        <MapPin size={13} />
        <span>{geo.outsideServiceArea ? "Hizmet bölgesi" : "Mevcut konum"}</span>
        <strong>
          {geo.outsideServiceArea
            ? KKTC_OUTSIDE_LOCATION_MESSAGE
            : (geo.location?.address ?? (geo.blocked ? "Konum izni gerekli" : "Konum alınıyor…"))}
        </strong>
      </div>
      <Suspense fallback={<div className="map-card map-loading" aria-label="Harita yükleniyor" />}>
        <MapCanvas />
      </Suspense>
      {active && !["completed", "cancelled"].includes(active.status) && (
        <Link to={`/ride/${active.id}`} className="home-active-ride">
          <Clock3 size={16} />
          <span>
            <strong>Aktif yolculuğun var</strong>
            <small>{active.pickupAddress} → {active.destinationAddress}</small>
          </span>
          <ArrowRight size={16} />
        </Link>
      )}
      <button className="destination-box" onClick={() => navigate("/search")}>
        <span className="search-dot" />
        <span>
          <small>Yolculuğa başla</small>
          <strong>Nereye gidiyorsun?</strong>
        </span>
        <Search size={21} />
      </button>
      <section className="quick-addresses" aria-labelledby="quick-title">
        <div className="section-heading">
          <div>
            <span>HIZLI ERİŞİM</span>
            <h2 id="quick-title">Kayıtlı yerlerin</h2>
          </div>
          <Link to="/profile/favorites">Düzenle</Link>
        </div>
        <div className="address-grid">
          {addresses.slice(0, 3).map((address) => (
            <button
              key={address.id}
              onClick={() => navigate("/search", { state: { destination: address.address } })}
            >
              <i>{addressIcon(address.type)}</i>
              <strong>{address.label}</strong>
              <span>{address.address}</span>
            </button>
          ))}
        </div>
      </section>
      <section aria-labelledby="nearby-title" className="nearby-strip">
        <div>
          <i>
            <Clock3 size={16} />
          </i>
          <span>
            <strong id="nearby-title">{waitLabel}</strong>
            <small>{drivers.length ? `${drivers.length} sürücü çevrim içi` : "Tahmini bekleme süresi"}</small>
          </span>
        </div>
        <div className="driver-faces" aria-label="Yakındaki sürücüler">
          {drivers.slice(0, 2).map((driver) => (
            <span key={driver.id}>
              <UserRound />
            </span>
          ))}
          {drivers.length > 2 && <span>+{drivers.length - 2}</span>}
        </div>
      </section>
      <section className="recent-rides" aria-labelledby="recent-title">
        <div className="section-heading">
          <div>
            <span>GEÇMİŞ</span>
            <h2 id="recent-title">Son yolculuklar</h2>
          </div>
          <Link to="/rides">
            Tümünü gör <ChevronRight size={14} />
          </Link>
        </div>
        {rides.slice(0, 2).map((ride) => (
          <Link to={`/rides/${ride.id}`} className="compact-ride" key={ride.id}>
            <div className="ride-route-line">
              <i />
              <i />
            </div>
            <div>
              <strong>{ride.destinationAddress}</strong>
              <span>{ride.pickupAddress}</span>
              <small>{formatWhen(ride.createdAt)}</small>
            </div>
            <b>₺{Number(ride.finalFare ?? ride.estimatedFare).toFixed(2)}</b>
            <ArrowRight size={16} />
          </Link>
        ))}
        {rides.length === 0 && <p className="empty-hint">Henüz yolculuk yok. Haritadan taksi çağırabilirsin.</p>}
      </section>
    </div>
  );
}
