import { LocateFixed, Navigation } from "lucide-react";
import { useEffect } from "react";
import { coordinatesClose } from "@heytaksi/ui";
import { InteractiveMap } from "../booking/InteractiveMap";
import { useBooking } from "../booking/BookingContext";
import { useCurrentLocation } from "../../hooks/useCurrentLocation";
import { useNearbyDrivers } from "../../hooks/useNearbyDrivers";

export function MapCanvas() {
  const booking = useBooking();
  const geo = useCurrentLocation();
  // Faz 6: haritadaki taksiler artık Redis konum defterinden gelen canlı sürücülerdir.
  const { drivers, closestEtaSeconds, loading } = useNearbyDrivers(geo.location);
  const pickup = booking.pickup;

  useEffect(() => {
    if (!geo.location) return;
    if (!pickup) {
      booking.setPickup(geo.location);
      return;
    }
    if (pickup.address === "Mevcut konum" && !coordinatesClose(pickup, geo.location, 0.0004)) {
      booking.setPickup(geo.location);
    }
  }, [geo.location, pickup, booking]);

  return (
    <section className="map-card real" aria-label="Canlı konum haritası">
      <InteractiveMap pickup={geo.location} nearbyDrivers={drivers} className="home-live-map" />
      <button className="locate-button" onClick={() => void geo.request()} aria-label="Konumumu bul">
        <LocateFixed size={19} />
      </button>
      <div className="map-status">
        <Navigation size={13} />
        <span>
          <strong>
            {geo.blocked
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
          {geo.loading
            ? "Konum bulunuyor…"
            : closestEtaSeconds != null
              ? `En yakını ${Math.max(1, Math.round(closestEtaSeconds / 60))} dk uzaklıkta`
            : geo.location?.address ?? "Konum bekleniyor"}
        </span>
      </div>
    </section>
  );
}
