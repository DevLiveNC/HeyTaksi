import { LocateFixed, Navigation } from "lucide-react";
import { useEffect, useState } from "react";
import { shouldAdoptDevicePickup } from "@heytaksi/ui";
import { InteractiveMap } from "../booking/InteractiveMap";
import { useBooking } from "../booking/BookingContext";
import { useCurrentLocation } from "../../hooks/useCurrentLocation";
import { useNearbyDrivers } from "../../hooks/useNearbyDrivers";

export function MapCanvas() {
  const booking = useBooking();
  const geo = useCurrentLocation();
  const { drivers, closestEtaSeconds, loading } = useNearbyDrivers(geo.location);
  const pickup = booking.pickup;
  const setPickup = booking.setPickup;
  const [recenterToken, setRecenterToken] = useState(0);

  useEffect(() => {
    if (!shouldAdoptDevicePickup(pickup, geo.location, false)) return;
    if (!geo.location) return;
    setPickup(geo.location);
  }, [geo.location, pickup, setPickup]);

  return (
    <section className="map-card real" aria-label="Canlı konum haritası">
      <InteractiveMap
        pickup={geo.location}
        nearbyDrivers={drivers}
        recenterToken={recenterToken}
        className="home-live-map"
      />
      <button
        className="locate-button"
        onClick={() => {
          void geo.requestPickup().then((point) => {
            if (point && shouldAdoptDevicePickup(pickup, point, false)) setPickup(point);
            setRecenterToken((value) => value + 1);
          });
        }}
        aria-label="Konumumu bul"
      >
        <LocateFixed size={19} />
      </button>
      <div className="map-status">
        <Navigation size={13} />
        <span>
          <strong>
            {geo.outsideServiceArea
              ? "Hizmet bölgesi dışı"
              : geo.blocked
                ? "Konum izni gerekli"
                : !geo.location
                  ? geo.loading
                    ? "Konum alınıyor…"
                    : "Konum alınamadı"
                  : loading
                    ? "Sürücüler aranıyor…"
                    : drivers.length
                      ? `${drivers.length} taksi yakınında`
                      : "Şu anda yakında taksi yok"}
          </strong>
          {geo.outsideServiceArea
            ? "Haritadan alış noktası seç"
            : geo.loading
            ? "Konum bulunuyor…"
            : closestEtaSeconds != null
              ? `En yakını ${Math.max(1, Math.round(closestEtaSeconds / 60))} dk uzaklıkta`
            : geo.location?.address ?? "Konum bekleniyor"}
        </span>
      </div>
    </section>
  );
}
