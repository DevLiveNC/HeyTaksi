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
import { lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
const MapCanvas = lazy(() => import("./MapCanvas").then((module) => ({ default: module.MapCanvas })));
import {
  usePassengerExperience,
  type Address,
} from "../../state/PassengerExperience";
import { useCurrentLocation } from "../../hooks/useCurrentLocation";
import { useNearbyDrivers } from "../../hooks/useNearbyDrivers";

const addressIcon = (type: Address["type"]) =>
  type === "home" ? (
    <Home />
  ) : type === "work" ? (
    <BriefcaseBusiness />
  ) : (
    <Star />
  );
export function HomePage() {
  const { state } = usePassengerExperience();
  const navigate = useNavigate();
  // Faz 6: yakındaki sürücü sayısı ve bekleme süresi canlı dağıtım verisinden gelir.
  const geo = useCurrentLocation();
  const { drivers, closestEtaSeconds } = useNearbyDrivers(geo.location);
  const waitLabel =
    closestEtaSeconds != null
      ? `En yakın taksi ${Math.max(1, Math.round(closestEtaSeconds / 60))} dk`
      : "Yakında taksi aranıyor";
  return (
    <div className="home-page">
      <div className="location-kicker">
        <MapPin size={13} />
        <span>Mevcut konum</span>
        <strong>{state.currentLocation}</strong>
      </div>
      <Suspense fallback={<div className="map-card map-loading" aria-label="Harita yükleniyor" />}><MapCanvas /></Suspense>
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
          {state.addresses.slice(0, 3).map((address) => (
            <button
              key={address.id}
              onClick={() =>
                navigate("/search", { state: { destination: address.address } })
              }
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
            <small>
              {drivers.length ? `${drivers.length} sürücü çevrim içi` : "Tahmini bekleme süresi"}
            </small>
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
        {state.rides.slice(0, 2).map((ride) => (
          <Link to={`/rides/${ride.id}`} className="compact-ride" key={ride.id}>
            <div className="ride-route-line">
              <i />
              <i />
            </div>
            <div>
              <strong>{ride.to}</strong>
              <span>{ride.from}</span>
              <small>
                {ride.date} · {ride.time}
              </small>
            </div>
            <b>₺{ride.fare.toFixed(2)}</b>
            <ArrowRight size={16} />
          </Link>
        ))}
      </section>
    </div>
  );
}
