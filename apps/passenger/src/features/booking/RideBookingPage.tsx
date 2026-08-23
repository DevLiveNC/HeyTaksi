import {
  ArrowLeft,
  CarFront,
  Check,
  Clock3,
  LoaderCircle,
  Route,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import type { VehicleType } from "@heytaksi/shared";
import { InteractiveMap } from "./InteractiveMap";
import { useBooking, type ActiveRide } from "./BookingContext";
import { rideApi } from "../../services/rideApi";
const vehicles: {
  type: VehicleType;
  name: string;
  caption: string;
  eta: number;
  multiplier: number;
  seats: number;
}[] = [
  {
    type: "standard",
    name: "Hey Taksi",
    caption: "Ekonomik ve hızlı",
    eta: 2,
    multiplier: 1,
    seats: 4,
  },
  {
    type: "comfort",
    name: "Konfor",
    caption: "Yeni ve konforlu araç",
    eta: 4,
    multiplier: 1.35,
    seats: 4,
  },
  {
    type: "xl",
    name: "XL",
    caption: "Gruplar için geniş",
    eta: 6,
    multiplier: 1.6,
    seats: 6,
  },
  {
    type: "accessible",
    name: "Erişilebilir",
    caption: "Özel erişim desteği",
    eta: 8,
    multiplier: 1.15,
    seats: 4,
  },
];
export function RideBookingPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const booking = useBooking();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (!booking.pickup || !booking.destination || !booking.route)
    return (
      <div className="sub-page empty-list">
        <Route />
        <h2>Önce rotanı oluştur</h2>
        <button onClick={() => navigate("/search")}>Konum seç</button>
      </div>
    );
  const base =
    45 +
    (booking.route.distanceMeters / 1000) * 18 +
    (booking.route.durationSeconds / 60) * 1.2;
  const selected = vehicles.find((item) => item.type === booking.vehicleType)!;
  const fare = Math.max(90, base * selected.multiplier);
  const request = async () => {
    setLoading(true);
    setError("");
    try {
      const ride = (await rideApi.create(auth.authorizedFetch, {
        pickup: booking.pickup!,
        destination: booking.destination!,
        vehicleType: booking.vehicleType,
      })) as unknown as ActiveRide;
      booking.setActiveRide(ride);
      navigate(`/ride/${ride.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Taksi çağrılamadı");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="booking-review">
      <InteractiveMap
        pickup={booking.pickup}
        destination={booking.destination}
        route={booking.route}
        className="review-map"
      />
      <header className="floating-back">
        <button onClick={() => navigate(-1)} aria-label="Geri dön">
          <ArrowLeft />
        </button>
        <strong>Aracını seç</strong>
      </header>
      <section className="vehicle-sheet">
        <div className="sheet-grabber" />
        <div className="trip-metrics">
          <span>
            <Route />
            <strong>
              {(booking.route.distanceMeters / 1000).toFixed(1)} km
            </strong>
            <small>Tahmini mesafe</small>
          </span>
          <span>
            <Clock3 />
            <strong>{Math.ceil(booking.route.durationSeconds / 60)} dk</strong>
            <small>Yolculuk süresi</small>
          </span>
        </div>
        <h2>Araç seçenekleri</h2>
        <div className="vehicle-options">
          {vehicles.map((vehicle) => {
            const price = Math.max(90, base * vehicle.multiplier);
            return (
              <button
                className={
                  booking.vehicleType === vehicle.type ? "selected" : ""
                }
                key={vehicle.type}
                onClick={() => booking.setVehicleType(vehicle.type)}
              >
                <i>
                  <CarFront />
                </i>
                <span>
                  <strong>{vehicle.name}</strong>
                  <small>
                    {vehicle.caption} · {vehicle.eta} dk
                  </small>
                  <em>
                    <Users />
                    {vehicle.seats}
                  </em>
                </span>
                <b>₺{price.toFixed(0)}</b>
                {booking.vehicleType === vehicle.type && <Check />}
              </button>
            );
          })}
        </div>
        <div className="safe-payment">
          <ShieldCheck />
          <span>
            <strong>Güvenli yolculuk</strong>
            <small>Tahmini fiyat trafik ve beklemeye göre değişebilir.</small>
          </span>
        </div>
        {error && <div className="booking-error">{error}</div>}
        <button
          className="request-primary"
          disabled={loading}
          onClick={() => void request()}
        >
          {loading ? <LoaderCircle /> : <CarFront />}
          {selected.name} çağır · ₺{fare.toFixed(0)}
        </button>
      </section>
    </div>
  );
}
