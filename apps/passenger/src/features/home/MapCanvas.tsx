import { LocateFixed, Navigation } from "lucide-react";
import { useEffect } from "react";
import { InteractiveMap } from "../booking/InteractiveMap";
import { useBooking } from "../booking/BookingContext";
import { useCurrentLocation } from "../../hooks/useCurrentLocation";
import { usePassengerExperience } from "../../state/PassengerExperience";
export function MapCanvas() {
  const { state } = usePassengerExperience();
  const booking = useBooking();
  const geo = useCurrentLocation();
  useEffect(() => {
    if (!geo.isFallback || !booking.pickup) booking.setPickup(geo.location);
  }, [geo.location, geo.isFallback]);
  return (
    <section className="map-card real" aria-label="Canlı konum haritası">
      <InteractiveMap pickup={geo.location} className="home-live-map" />
      {state.nearbyTaxis.map((taxi) => (
        <span
          className="taxi-marker live-taxi"
          key={taxi.id}
          style={{
            left: `${taxi.x}%`,
            top: `${taxi.y}%`,
            transform: `rotate(${taxi.rotation}deg)`,
          }}
          aria-label={`${taxi.eta} dakika uzaklıkta taksi`}
        >
          ▰
        </span>
      ))}
      <button
        className="locate-button"
        onClick={geo.request}
        aria-label="Konumumu bul"
      >
        <LocateFixed size={19} />
      </button>
      <div className="map-status">
        <Navigation size={13} />
        <span>
          <strong>
            {geo.isFallback
              ? "Konum izni gerekli"
              : `${state.nearbyTaxis.length} taksi yakınında`}
          </strong>
          {geo.loading ? "Konum bulunuyor…" : geo.location.address}
        </span>
      </div>
    </section>
  );
}
