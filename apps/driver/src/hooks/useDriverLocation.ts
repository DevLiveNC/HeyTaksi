import { useEffect, useRef, useState } from "react";
import { useAuth } from "@heytaksi/ui";
import { driverApi } from "../services/driverApi";

const fallback = { latitude: 36.8121, longitude: 34.6415 };

/** Çevrim içiyken sürücü konumunu izler; 10 saniyede bir sunucuya bildirir. */
export function useDriverLocation(enabled: boolean) {
  const { authorizedFetch } = useAuth();
  const [location, setLocation] = useState(fallback);
  const [heading, setHeading] = useState<number | undefined>();
  const lastSent = useRef(0);
  const fetcher = useRef(authorizedFetch);
  fetcher.current = authorizedFetch;

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation(next);
        setHeading(position.coords.heading ?? undefined);
        const now = Date.now();
        if (now - lastSent.current > 10_000) {
          lastSent.current = now;
          const heading = position.coords.heading;
          void driverApi
            .reportLocation(fetcher.current, {
              ...next,
              ...(heading != null ? { heading } : {}),
              accuracyMeters: position.coords.accuracy,
            })
            .catch(() => undefined);
        }
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return { location, heading };
}
