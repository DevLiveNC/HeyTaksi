import {
  ArrowLeft,
  CalendarDays,
  CarFront,
  Clock3,
  Download,
  MapPin,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { usePassengerExperience } from "../../state/PassengerExperience";
export function RideDetailPage() {
  const navigate = useNavigate();
  const { rideId } = useParams();
  const { state } = usePassengerExperience();
  const ride = state.rides.find((item) => item.id === rideId);
  if (!ride) return <div className="sub-page">Yolculuk bulunamadı.</div>;
  return (
    <div className="sub-page detail-page">
      <header className="sub-header">
        <button onClick={() => navigate(-1)} aria-label="Geri dön">
          <ArrowLeft />
        </button>
        <div>
          <small>YOLCULUK DETAYI</small>
          <h1>{ride.date}</h1>
        </div>
        <button aria-label="Makbuzu indir">
          <Download />
        </button>
      </header>
      <section className="detail-map">
        <div className="detail-map-route">
          <i />
          <span />
          <i />
        </div>
        <MapPin />
        <span>Temsili rota</span>
      </section>
      <section className="detail-card">
        <div className="detail-status">
          <ShieldCheck />
          <span>
            <strong>
              {ride.status === "completed"
                ? "Güvenle tamamlandı"
                : "İptal edildi"}
            </strong>
            <small>
              <CalendarDays />
              {ride.date} <Clock3 />
              {ride.time}
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
              Nereden<strong>{ride.from}</strong>
            </span>
            <span>
              Nereye<strong>{ride.to}</strong>
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
          <strong>{ride.driver}</strong>
          <span>
            <Star />
            4.9 · {ride.plate}
          </span>
        </div>
        <CarFront />
      </section>
      <section className="fare-detail">
        <span>
          Yolculuk ücreti<small>{ride.vehicle}</small>
        </span>
        <strong>₺{ride.fare.toFixed(2)}</strong>
      </section>
      <button className="outline-action">Destek al</button>
    </div>
  );
}
