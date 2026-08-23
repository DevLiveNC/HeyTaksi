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
import { Link, useNavigate } from "react-router-dom";
import { MapCanvas } from "./MapCanvas";
import {
  usePassengerExperience,
  type Address,
} from "../../state/PassengerExperience";

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
  return (
    <div className="home-page">
      <div className="location-kicker">
        <MapPin size={13} />
        <span>Mevcut konum</span>
        <strong>{state.currentLocation}</strong>
      </div>
      <MapCanvas />
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
            <strong id="nearby-title">En yakın taksi 2 dk</strong>
            <small>Tahmini bekleme süresi</small>
          </span>
        </div>
        <div className="driver-faces" aria-label="Yakındaki sürücüler">
          <span>
            <UserRound />
          </span>
          <span>
            <UserRound />
          </span>
          <span>+2</span>
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
