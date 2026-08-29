import { ArrowLeft, CalendarDays, CarFront, Clock3, MapPin, ShieldCheck, Star, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import type { RideHistoryItem } from "@heytaksi/shared";
import { rideApi } from "../../services/rideApi";
import { InteractiveMap } from "../booking/InteractiveMap";

const formatWhen = (value: string) =>
  new Date(value).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function RideDetailPage() {
  const navigate = useNavigate();
  const { rideId = "" } = useParams();
  const auth = useAuth();
  const [ride, setRide] = useState<RideHistoryItem | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    rideApi
      .get(auth.authorizedFetch, rideId)
      .then((next) => {
        if (alive) setRide(next);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Yolculuk bulunamadı."));
    return () => {
      alive = false;
    };
  }, [auth.authorizedFetch, rideId]);

  if (error) {
    return (
      <div className="sub-page empty-list">
        <MapPin />
        <h2>{error}</h2>
        <button onClick={() => navigate("/rides")}>Yolculuklara dön</button>
      </div>
    );
  }
  if (!ride) return <div className="sub-page">Yolculuk yükleniyor…</div>;

  return (
    <div className="sub-page detail-page">
      <header className="sub-header">
        <button onClick={() => navigate(-1)} aria-label="Geri dön">
          <ArrowLeft />
        </button>
        <div>
          <small>YOLCULUK DETAYI</small>
          <h1>{formatWhen(ride.createdAt)}</h1>
        </div>
      </header>
      <section className="detail-map">
        {ride.pickup.latitude ? (
          <InteractiveMap
            pickup={ride.pickup}
            destination={ride.destination}
            route={
              ride.geometry
                ? { distanceMeters: ride.distanceMeters, durationSeconds: ride.durationSeconds, geometry: ride.geometry }
                : null
            }
            className="detail-live-map"
          />
        ) : (
          <>
            <div className="detail-map-route">
              <i />
              <span />
              <i />
            </div>
            <MapPin />
            <span>{ride.pickupAddress} → {ride.destinationAddress}</span>
          </>
        )}
      </section>
      <section className="detail-card">
        <div className="detail-status">
          <ShieldCheck />
          <span>
            <strong>
              {ride.status === "completed" ? "Güvenle tamamlandı" : ride.status === "cancelled" ? "İptal edildi" : "Devam ediyor"}
            </strong>
            <small>
              <CalendarDays />
              {formatWhen(ride.createdAt)} <Clock3 />
              {Math.max(1, Math.round(ride.durationSeconds / 60))} dk
            </small>
          </span>
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
      </section>
      <section className="driver-detail">
        <div className="driver-avatar">
          <UserRound />
        </div>
        <div>
          <small>SÜRÜCÜ</small>
          <strong>{ride.driverName ?? "Atanmadı"}</strong>
          <span>
            <Star /> {ride.vehicle ?? ride.vehicleType} · {ride.plate ?? "—"}
          </span>
        </div>
        <CarFront />
      </section>
      <section className="fare-detail">
        <span>
          Yolculuk ücreti<small>{ride.vehicleType}</small>
        </span>
        <strong>₺{Number(ride.finalFare ?? ride.estimatedFare).toFixed(2)}</strong>
      </section>
    </div>
  );
}
