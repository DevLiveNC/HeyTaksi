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
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  coordinatesClose,
  isLivePickup,
  locatingPickupLabel,
  mapClickTarget,
  pinModeAfterAdoptingPickup,
  shouldAdoptDevicePickup,
  useAuth,
  type MapPinMode,
} from "@heytaksi/ui";
import {
  KKTC_OUTSIDE_LOCATION_MESSAGE,
  isInKktcServiceArea,
  kktcPlaceToSearchHit,
  matchKktcPlaces,
  type Coordinate,
} from "@heytaksi/shared";
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
  const [pinMode, setPinMode] = useState<MapPinMode>("destination");
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState("");
  const [recenterToken, setRecenterToken] = useState(0);
  const adoptLive = useRef(false);
  const setPickup = booking.setPickup;
  const setDestination = booking.setDestination;

  useEffect(() => {
    if (!shouldAdoptDevicePickup(booking.pickup, geo.location, adoptLive.current)) return;
    if (!geo.location) return;
    adoptLive.current = false;
    setPickup(geo.location);
    setPinMode(pinModeAfterAdoptingPickup());
  }, [geo.location, booking.pickup, setPickup]);

  useEffect(() => {
    const pickup = booking.pickup;
    if (!isLivePickup(pickup)) return;
    let alive = true;
    locationApi
      .reverse(auth.authorizedFetch, pickup)
      .then((resolved) => {
        if (!alive) return;
        const current = booking.pickup;
        if (!isLivePickup(current)) return;
        if (!coordinatesClose(current, resolved, 0.0004)) return;
        setPickup(resolved);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [auth.authorizedFetch, booking.pickup, setPickup]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(matchKktcPlaces(trimmed).map(kktcPlaceToSearchHit));
      return;
    }
    const near = booking.pickup ?? geo.location ?? undefined;
    const timer = setTimeout(() => {
      setSearching(true);
      setError("");
      locationApi
        .search(auth.authorizedFetch, trimmed, near)
        .then(setResults)
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : "Adres aranamadı"),
        )
        .finally(() => setSearching(false));
    }, 450);
    return () => clearTimeout(timer);
  }, [query, auth.authorizedFetch, booking.pickup?.latitude, booking.pickup?.longitude, geo.location?.latitude, geo.location?.longitude]);

  const selectDestination = (point: Coordinate) => {
    setDestination(point);
    setQuery(point.address);
    setResults([]);
    setPinMode("destination");
  };

  const applyMapPoint = (resolved: Coordinate, pickingPickup: boolean) => {
    if (pickingPickup) {
      adoptLive.current = false;
      setPickup(resolved);
      setPinMode(pinModeAfterAdoptingPickup());
    } else {
      selectDestination(resolved);
    }
  };

  const mapClick = async (point: { latitude: number; longitude: number }) => {
    const target = mapClickTarget(pinMode, Boolean(booking.pickup));
    setResolving(true);
    setError("");
    const fallback: Coordinate = {
      latitude: point.latitude,
      longitude: point.longitude,
      address: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
    };
    try {
      applyMapPoint(await locationApi.reverse(auth.authorizedFetch, point), target === "pickup");
    } catch (cause) {
      if (isInKktcServiceArea(point.latitude, point.longitude)) {
        applyMapPoint(fallback, target === "pickup");
      }
      setError(cause instanceof Error ? cause.message : "Konum bulunamadı");
    } finally {
      setResolving(false);
    }
  };

  const useCurrentAsPickup = async () => {
    adoptLive.current = true;
    const point = (await geo.requestPickup()) ?? geo.location;
    if (!point) return;
    adoptLive.current = false;
    setPickup(point);
    setPinMode(pinModeAfterAdoptingPickup());
    setRecenterToken((value) => value + 1);
  };

  const continueRoute = async () => {
    if (!booking.pickup || !booking.destination) return;
    setRouting(true);
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
      setRouting(false);
    }
  };

  const busy = searching || resolving || routing;
  const pickupLabel = locatingPickupLabel({
    address: booking.pickup?.address ?? null,
    blocked: geo.blocked,
    loading: geo.loading,
    hasFix: Boolean(geo.location),
    failed: Boolean(geo.error),
    outsideServiceArea: geo.outsideServiceArea,
  });
  return (
    <div className="booking-map-page">
      <InteractiveMap
        pickup={booking.pickup}
        destination={booking.destination}
        onMapClick={(point) => void mapClick(point)}
        recenterToken={recenterToken}
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
        <div className={`location-fields ${pinMode === "pickup" ? "picking-pickup" : "picking-destination"}`}>
          <i className="pickup-dot" />
          <label>
            <span>ALIŞ NOKTASI</span>
            <input
              value={pickupLabel}
              readOnly
              onClick={() => setPinMode("pickup")}
            />
          </label>
          <button
            onClick={() => void useCurrentAsPickup()}
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
            onClick={() => setPinMode("destination")}
            className={pinMode === "destination" ? "active" : ""}
            aria-label="Haritadan pin seç"
          >
            <MapPin />
          </button>
        </div>
        {geo.outsideServiceArea && (
          <p className="permission-warning">{KKTC_OUTSIDE_LOCATION_MESSAGE}</p>
        )}
        {geo.blocked && (
          <p className="permission-warning">
            Konum izni kapalı. Yakındaki taksileri ve doğru alış noktasını kullanmak için konuma izin vermen gerekir.
          </p>
        )}
        {!geo.blocked && !geo.outsideServiceArea && !booking.pickup && !geo.loading && (
          <p className="permission-warning">
            Konum alınamadı. Alış noktasını haritadan seçebilir veya konum düğmesine tekrar basabilirsin.
          </p>
        )}
        {!booking.pickup && (
          <div className="pin-hint">
            <Navigation />
            Haritada alış noktasına dokun
          </div>
        )}
        {booking.pickup && pinMode === "pickup" && (
          <div className="pin-hint">
            <Navigation />
            Haritada alış noktasını seç
          </div>
        )}
        {booking.pickup && pinMode === "destination" && !booking.destination && (
          <div className="pin-hint">
            <Navigation />
            Haritada varış noktasına dokun veya adres yaz
          </div>
        )}
        {(searching || resolving) && (
          <div className="search-loading">
            <LoaderCircle />
            {resolving ? "Konum çözülüyor…" : "Adres aranıyor…"}
          </div>
        )}
        {results.length > 0 && (
          <div className="live-search-results">
            {results.map((item) => (
              <button
                key={item.id}
                onClick={() => selectDestination(item)}
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
          disabled={!booking.pickup || !booking.destination || routing}
          onClick={() => void continueRoute()}
        >
          {busy && routing ? <LoaderCircle /> : <Search />}Rotayı ve seçenekleri gör
        </button>
      </section>
    </div>
  );
}
