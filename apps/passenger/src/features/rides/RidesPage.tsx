import {
  CalendarDays,
  CarFront,
  ChevronRight,
  Clock3,
  MapPin,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  usePassengerExperience,
  type RideStatus,
} from "../../state/PassengerExperience";
const filters: { value: "all" | RideStatus; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "completed", label: "Tamamlandı" },
  { value: "cancelled", label: "İptal" },
  { value: "upcoming", label: "Planlanan" },
];
const statusLabel: Record<RideStatus, string> = {
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
  upcoming: "Planlandı",
};
export function RidesPage() {
  const { state, dispatch } = usePassengerExperience();
  const rides =
    state.selectedRideFilter === "all"
      ? state.rides
      : state.rides.filter((ride) => ride.status === state.selectedRideFilter);
  return (
    <div className="sub-page rides-page">
      <header className="page-title">
        <span>YOLCULUK ARŞİVİ</span>
        <h1>Yolculukların</h1>
        <p>Tüm hareketlerin tek yerde.</p>
      </header>
      <div className="filter-tabs" role="tablist" aria-label="Yolculuk durumu">
        {filters.map((filter) => (
          <button
            role="tab"
            aria-selected={state.selectedRideFilter === filter.value}
            className={
              state.selectedRideFilter === filter.value ? "active" : ""
            }
            key={filter.value}
            onClick={() =>
              dispatch({ type: "set-ride-filter", value: filter.value })
            }
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className="ride-list">
        {rides.map((ride) => (
          <Link to={`/rides/${ride.id}`} className="ride-card" key={ride.id}>
            <div className="ride-card-head">
              <span>
                <CalendarDays size={14} />
                {ride.date}
                <i /> <Clock3 size={14} />
                {ride.time}
              </span>
              <em className={`status-${ride.status}`}>
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
                  Nereden<strong>{ride.from}</strong>
                </span>
                <span>
                  Nereye<strong>{ride.to}</strong>
                </span>
              </div>
            </div>
            <footer>
              <span>
                <CarFront size={17} />
                <span>
                  <strong>{ride.driver}</strong>
                  <small>{ride.vehicle}</small>
                </span>
              </span>
              <b>₺{ride.fare.toFixed(2)}</b>
              <ChevronRight size={18} />
            </footer>
          </Link>
        ))}
        {rides.length === 0 && (
          <div className="empty-list">
            <MapPin />
            <h2>Henüz yolculuk yok</h2>
            <p>Bu durumdaki yolculukların burada görünecek.</p>
          </div>
        )}
      </div>
    </div>
  );
}
