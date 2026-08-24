import {
  Activity,
  CircleDollarSign,
  Coffee,
  Flame,
  MapPin,
  Navigation2,
  Power,
  Star,
  CarFront,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useDriver } from "../../state/DriverContext";
import { useDriverLocation } from "../../hooks/useDriverLocation";
import { DriverMap } from "./DriverMap";
import { RideOfferSheet } from "../offer/RideOfferSheet";

const demandLabels = { high: "Yoğun", medium: "Artan", low: "Sakin" } as const;

export function DashboardPage() {
  const { dashboard, ride, error, setAvailability, busy, socket } = useDriver();
  const availability = dashboard?.availability ?? "offline";
  const onDuty = availability !== "offline";
  // Konum sinyali açık soket üzerinden gider; soket kapalıysa REST'e düşer.
  const { location } = useDriverLocation(onDuty, socket, ride?.id ?? null);
  const offerPending = ride?.status === "driver_assigned";

  if (!dashboard)
    return (
      <div className="panel-loading">
        <span>HT</span>
        <p>{error ?? "Panel yükleniyor…"}</p>
      </div>
    );

  return (
    <div className="dashboard-page">
      <section className={`duty-hero ${onDuty ? "on" : "off"}`}>
        <div className="duty-head">
          <div>
            <small>SÜRÜCÜ DURUMU</small>
            <h1>{onDuty ? (availability === "on_trip" ? "Yolculuktasın" : availability === "paused" ? "Moladasın" : "Göreve hazırsın") : "Çevrim dışısın"}</h1>
          </div>
          <button
            className={`duty-switch ${onDuty ? "on" : ""}`}
            role="switch"
            aria-checked={onDuty}
            aria-label={onDuty ? "Çevrim dışı ol" : "Çevrim içi ol"}
            disabled={busy || availability === "on_trip" || (onDuty && dashboard.verificationStatus !== "verified")}
            onClick={() => void setAvailability(onDuty ? "offline" : "online")}
          >
            <span className="duty-knob">
              <Power size={16} />
            </span>
          </button>
        </div>
        {onDuty ? (
          <div className="duty-actions">
            {availability === "paused" ? (
              <button onClick={() => void setAvailability("online")} disabled={busy}>
                <Activity size={16} /> Göreve dön
              </button>
            ) : (
              availability !== "on_trip" && (
                <button onClick={() => void setAvailability("paused")} disabled={busy}>
                  <Coffee size={16} /> Mola ver
                </button>
              )
            )}
            <span className="duty-hint">Molada yeni teklif almazsın.</span>
          </div>
        ) : (
          <p className="duty-hint">
            {dashboard.verificationStatus === "verified"
              ? "Anahtarı açtığında yakındaki yolculuk talepleri sana gelmeye başlar."
              : "Çevrim içi olmak için sürücü doğrulamanın tamamlanması gerekir."}
          </p>
        )}
      </section>

      {ride && !offerPending && (
        <Link to="/ride" className="active-ride-banner">
          <CarFront size={20} />
          <span>
            <strong>Aktif yolculuğun sürüyor</strong>
            <small>{ride.pickupAddress} → {ride.destinationAddress}</small>
          </span>
          <Navigation2 size={18} />
        </Link>
      )}

      <div className="metric-grid">
        <article>
          <CircleDollarSign size={16} />
          <small>Bugünkü kazanç</small>
          <strong>₺{dashboard.todayEarnings.toFixed(2)}</strong>
        </article>
        <article>
          <CarFront size={16} />
          <small>Bugünkü yolculuk</small>
          <strong>{dashboard.todayTrips}</strong>
        </article>
        <article>
          <Star size={16} />
          <small>Ortalama puan</small>
          <strong>{dashboard.rating.toFixed(2)}</strong>
        </article>
        <article>
          <Flame size={16} />
          <small>Kabul oranı</small>
          <strong>%{dashboard.acceptanceRate.toFixed(0)}</strong>
        </article>
      </div>

      <DriverMap driverLocation={location} hotspots={dashboard.hotspots} ride={ride} navigateTo={ride?.status === "in_progress" || ride?.status === "started" ? "destination" : "pickup"} />

      <section className="hotspots-card" aria-labelledby="hotspot-title">
        <div className="section-heading">
          <div>
            <span>SON 3 SAAT</span>
            <h2 id="hotspot-title">Yoğunluk bölgeleri</h2>
          </div>
          <Link to="/earnings">Kazanç</Link>
        </div>
        {dashboard.hotspots.length ? (
          <ul className="hotspot-list">
            {dashboard.hotspots.map((spot) => (
              <li key={spot.id}>
                <MapPin size={15} />
                <span>
                  <strong>{spot.address.split(",")[0]}</strong>
                  <small>{spot.rideCount} talep · {demandLabels[spot.demandLevel]}</small>
                </span>
                <em className={`demand ${spot.demandLevel}`}>{demandLabels[spot.demandLevel]}</em>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hotspot-empty">Bu saatlerde belirgin bir yoğunluk yok; harita canlı taleplerle güncellenir.</p>
        )}
      </section>

      {error && <div className="driver-error">{error}</div>}
      {offerPending && <RideOfferSheet />}
    </div>
  );
}
