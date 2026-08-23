import {
  ArrowLeft,
  Crosshair,
  Home,
  LoaderCircle,
  MapPin,
  Navigation,
  Search,
  Star,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@heytaksi/ui";
import type { Coordinate } from "@heytaksi/shared";
import { InteractiveMap } from "../booking/InteractiveMap";
import { useBooking } from "../booking/BookingContext";
import { useCurrentLocation } from "../../hooks/useCurrentLocation";
import { locationApi, type SearchResult } from "../../services/rideApi";
import { usePassengerExperience } from "../../state/PassengerExperience";
export function DestinationSearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const booking = useBooking();
  const { dispatch } = usePassengerExperience();
  const geo = useCurrentLocation();
  const [query, setQuery] = useState((location.state as { destination?: string } | null)?.destination ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pinMode, setPinMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!geo.isFallback || !booking.pickup) booking.setPickup(geo.location);
  }, [geo.location, geo.isFallback]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      locationApi
        .search(auth.authorizedFetch, query, booking.pickup ?? geo.location)
        .then(setResults)
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : "Adres aranamadı"),
        )
        .finally(() => setLoading(false));
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);
  const selectDestination = async (point: Coordinate) => {
    booking.setDestination(point);
    setQuery(point.address);
    setResults([]);
    setPinMode(false);
  };
  const mapClick = async (point: { latitude: number; longitude: number }) => {
    if (!pinMode) return;
    setLoading(true);
    try {
      await selectDestination(
        await locationApi.reverse(auth.authorizedFetch, point),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Konum bulunamadı");
    } finally {
      setLoading(false);
    }
  };
  const continueRoute = async () => {
    if (!booking.pickup || !booking.destination) return;
    setLoading(true);
    setError("");
    try {
      booking.setRoute(
        await locationApi.route(
          auth.authorizedFetch,
          booking.pickup,
          booking.destination,
        ),
      );
      navigate("/book");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rota oluşturulamadı");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="booking-map-page">
      <InteractiveMap
        pickup={booking.pickup}
        destination={booking.destination}
        onMapClick={(point) => void mapClick(point)}
        className="booking-full-map"
      />
      <header className="floating-back">
        <button onClick={() => navigate(-1)} aria-label="Geri dön">
          <ArrowLeft />
        </button>
        <strong>Rotanı oluştur</strong>
      </header>
      <section className="location-sheet">
        <div className="sheet-grabber" />
        <div className="location-fields">
          <i className="pickup-dot" />
          <label>
            <span>ALIŞ NOKTASI</span>
            <input
              value={booking.pickup?.address ?? "Konum alınıyor…"}
              readOnly
            />
          </label>
          <button onClick={geo.request} aria-label="Mevcut konumu kullan">
            <Crosshair />
          </button>
          <i className="destination-dot" />
          <label>
            <span>VARIŞ NOKTASI</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nereye gidiyorsun?"
              autoFocus
            />
          </label>
          <button
            onClick={() => setPinMode(!pinMode)}
            className={pinMode ? "active" : ""}
            aria-label="Haritadan pin seç"
          >
            <MapPin />
          </button>
        </div>
        {geo.permission === "denied" && (
          <p className="permission-warning">
            Konum izni kapalı. Varsayılan konumu kullanabilir veya tarayıcı
            ayarlarından izin verebilirsin.
          </p>
        )}
        {pinMode && (
          <div className="pin-hint">
            <Navigation />
            Haritada istediğin noktaya dokun
          </div>
        )}
        {loading && (
          <div className="search-loading">
            <LoaderCircle />
            Konum aranıyor…
          </div>
        )}
        {results.length > 0 && (
          <div className="live-search-results">
            {results.map((item) => (
              <button
                key={item.id}
                onClick={() => void selectDestination(item)}
              >
                <MapPin />
                <span>
                  <strong>{item.address.split(",")[0]}</strong>
                  <small>{item.address}</small>
                </span>
              </button>
            ))}
          </div>
        )}
        {error && <div className="booking-error">{error}</div>}
        <div className="save-place-actions">
          {booking.destination && (
            <>
              <button
                onClick={() =>
                  dispatch({
                    type: "save-address",
                    address: {
                      id: "home",
                      label: "Ev",
                      address: booking.destination!.address,
                      type: "home",
                    },
                  })
                }
              >
                <Home />
                Ev olarak kaydet
              </button>
              <button
                onClick={() =>
                  dispatch({
                    type: "save-address",
                    address: {
                      id: "work",
                      label: "İş",
                      address: booking.destination!.address,
                      type: "work",
                    },
                  })
                }
              >
                <Star />
                İş olarak kaydet
              </button>
            </>
          )}
        </div>
        <button
          className="request-primary"
          disabled={!booking.destination || loading}
          onClick={() => void continueRoute()}
        >
          {loading ? <LoaderCircle /> : <Search />}Rotayı ve seçenekleri gör
        </button>
      </section>
    </div>
  );
}
