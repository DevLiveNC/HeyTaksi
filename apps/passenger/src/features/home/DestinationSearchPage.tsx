import {
  ArrowLeft,
  BriefcaseBusiness,
  Clock3,
  Home,
  MapPin,
  Navigation,
  Star,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePassengerExperience } from "../../state/PassengerExperience";

export function DestinationSearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = usePassengerExperience();
  const preset =
    (location.state as { destination?: string } | null)?.destination ?? "";
  const [query, setQuery] = useState(preset);
  return (
    <div className="sub-page search-page">
      <header className="sub-header">
        <button onClick={() => navigate(-1)} aria-label="Geri dön">
          <ArrowLeft />
        </button>
        <div>
          <small>YENİ YOLCULUK</small>
          <h1>Rota oluştur</h1>
        </div>
      </header>
      <div className="route-inputs">
        <div className="route-rail">
          <i />
          <span />
          <i />
        </div>
        <label>
          <span>NEREDEN</span>
          <input value={state.currentLocation} readOnly />
        </label>
        <label>
          <span>NEREYE</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Adres veya konum ara"
          />
        </label>
        <button aria-label="Haritadan seç">
          <Navigation size={19} />
        </button>
      </div>
      <section className="search-results">
        <h2>{query ? "Arama sonuçları" : "Önerilen yerler"}</h2>
        {state.addresses
          .filter(
            (item) =>
              !query ||
              item.address
                .toLocaleLowerCase("tr")
                .includes(query.toLocaleLowerCase("tr")) ||
              item.label
                .toLocaleLowerCase("tr")
                .includes(query.toLocaleLowerCase("tr")),
          )
          .map((item) => (
            <button key={item.id}>
              <i>
                {item.type === "home" ? (
                  <Home />
                ) : item.type === "work" ? (
                  <BriefcaseBusiness />
                ) : (
                  <Star />
                )}
              </i>
              <span>
                <strong>{item.label}</strong>
                <small>{item.address}</small>
              </span>
            </button>
          ))}
        {query && (
          <button>
            <i>
              <MapPin />
            </i>
            <span>
              <strong>{query}</strong>
              <small>Haritada ara</small>
            </span>
          </button>
        )}
      </section>
      <div className="phase-notice">
        <Clock3 />
        <p>
          <strong>Arama UI'ı hazır.</strong> Gerçek rota ve GPS servisi sonraki
          fazda bağlanacak.
        </p>
      </div>
    </div>
  );
}
