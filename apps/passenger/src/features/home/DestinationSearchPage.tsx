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
import { coordinatesClose, locatingPickupLabel, useAuth } from "@heytaksi/ui";
import type { Coordinate } from "@heytaksi/shared";
import { InteractiveMap } from "../booking/InteractiveMap";
import { useBooking } from "../booking/BookingContext";
import { useCurrentLocation } from "../../hooks/useCurrentLocation";
import { locationApi, type SearchResult } from "../../services/rideApi";
import { usePassengerExperience } from "../../state/PassengerExperience";

type PinMode = "pickup" | "destination" | null;

export function DestinationSearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const booking = useBooking();
  const { dispatch } = usePassengerExperience();
  const geo = useCurrentLocation();
  const [query, setQuery] = useState((location.state as { destination?: string } | null)?.destination ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pinMode, setPinMode] = useState<PinMode>("pickup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!geo.location) return;
    const current = booking.pickup;
    // Kullanıcının seçtiği alış noktasını GPS titremesiyle ezme; yalnızca boşsa veya
    // hâlâ "canlı konum" ise ve anlamlı yer değiştiyse güncelle.
    if (!current) {
      booking.setPickup(geo.location);
      setPinMode((mode) => (mode === "pickup" ? null : mode));
      return;
    }
    if (current.address === "Mevcut konum" && !coordinatesClose(current, geo.location, 0.0004)) {
      booking.setPickup(geo.location);
    }
  }, [geo.location?.latitude, geo.location?.longitude]);
  useEffect(() => {
    const pickup = booking.pickup;
    if (!pickup || pickup.address !== "Mevcut konum") return;
    let alive = true;
    locationApi
      .reverse(auth.authorizedFetch, pickup)
      .then((resolved) => {
        if (!alive) return;
        const current = booking.pickup;
        if (!current || current.address !== "Mevcut konum") return;
        if (!coordinatesClose(current, resolved, 0.0004)) return;
        booking.setPickup(resolved);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [auth.authorizedFetch, booking.pickup?.latitude, booking.pickup?.longitude, booking.pickup?.address]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const near = booking.pickup ?? geo.location;
    if (!near) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      locationApi
        .search(auth.authorizedFetch, query, near)
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
    setPinMode(null);
  };
  const mapClick = async (point: { latitude: number; longitude: number }) => {
    if (!pinMode) return;
    setLoading(true);
    const fallback: Coordinate = {
      latitude: point.latitude,
      longitude: point.longitude,
      address: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
    };
    try {
      const resolved = await locationApi.reverse(auth.authorizedFetch, point);
      if (pinMode === "pickup") {
        booking.setPickup(resolved);
        setPinMode(booking.destination ? null : "destination");
      } else {
        await selectDestination(resolved);
      }
    } catch (cause) {
      if (pinMode === "pickup") {
        booking.setPickup(fallback);
        setPinMode(booking.destination ? null : "destination");
      } else {
        await selectDestination(fallback);
      }
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
  const pickupLabel = locatingPickupLabel({
    address: booking.pickup?.address ?? null,
    blocked: geo.blocked,
    loading: geo.loading,
    hasFix: geo.hasFix,
    failed: Boolean(geo.error),
  });
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
              value={pickupLabel}
              readOnly
              onClick={() => setPinMode(pinMode === "pickup" ? null : "pickup")}
            />
          </label>
          <button
            onClick={() => void geo.request()}
            className={geo.loading ? "active" : ""}
            aria-label="Mevcut konumu kullan"
          >
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
            onClick={() => setPinMode(pinMode === "destination" ? null : "destination")}
            className={pinMode === "destination" ? "active" : ""}
            aria-label="Haritadan pin seç"
          >
            <MapPin />
          </button>
        </div>
        {geo.blocked && (
          <p className="permission-warning">
            Konum izni kapalı. Yakındaki taksileri ve doğru alış noktasını kullanmak için konuma izin vermen gerekir.
          </p>
        )}
        {!geo.blocked && !booking.pickup && !geo.loading && (
          <p className="permission-warning">
            Konum alınamadı. Alış noktasını haritadan seçebilir veya konum düğmesine tekrar basabilirsin.
          </p>
        )}
        {pinMode && (
          <div className="pin-hint">
            <Navigation />
            {pinMode === "pickup" ? "Haritada alış noktasını seç" : "Haritada varış noktasına dokun"}
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
          disabled={!booking.pickup || !booking.destination || loading}
          onClick={() => void continueRoute()}
        >
          {loading ? <LoaderCircle /> : <Search />}Rotayı ve seçenekleri gör
        </button>
      </section>
    </div>
  );
}
