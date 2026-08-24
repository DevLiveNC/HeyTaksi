import { useEffect, useRef, useState } from "react";
import { useAuth } from "@heytaksi/ui";
import { DRIVER_LOCATION_INTERVAL_SECONDS } from "@heytaksi/shared";
import { driverApi } from "../services/driverApi";
import type { DriverSocket } from "../services/rideSocket";

const fallback = { latitude: 36.8121, longitude: 34.6415 };

/**
 * Sürücü konum takibi.
 *
 * Çevrim içiyken tarayıcı konumu izlenir ve {@link DRIVER_LOCATION_INTERVAL_SECONDS}
 * saniyede bir sunucuya gönderilir. Birincil yol açık WebSocket'tir (düşük gecikme);
 * soket kapalıysa aynı sinyal REST ucuna düşer, böylece dispatch sürücüyü kaybetmez.
 */
export function useDriverLocation(enabled: boolean, socket?: DriverSocket | null, rideId?: string | null) {
  const { authorizedFetch } = useAuth();
  const [location, setLocation] = useState(fallback);
  const [heading, setHeading] = useState<number | undefined>();
  const lastSent = useRef(0);
  const fetcher = useRef(authorizedFetch);
  fetcher.current = authorizedFetch;
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const rideRef = useRef(rideId);
  rideRef.current = rideId;

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
        if (now - lastSent.current < DRIVER_LOCATION_INTERVAL_SECONDS * 1000) return;
        lastSent.current = now;
        const ping = {
          ...next,
          ...(position.coords.heading != null ? { heading: position.coords.heading } : {}),
          ...(position.coords.speed != null ? { speedMps: Math.max(0, position.coords.speed) } : {}),
          accuracyMeters: position.coords.accuracy,
          ...(rideRef.current ? { rideId: rideRef.current } : {}),
        };
        // Önce soket; başarısızsa REST yedeği.
        if (!socketRef.current?.sendLocation(ping))
          void driverApi.reportLocation(fetcher.current, ping).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return { location, heading };
}
