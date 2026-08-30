import { useEffect, useRef, useState } from "react";
import { useAuth } from "@heytaksi/ui";
import { DRIVER_LOCATION_INTERVAL_SECONDS } from "@heytaksi/shared";
import { driverApi } from "../services/driverApi";
import type { DriverSocket } from "../services/rideSocket";

const fallback = { latitude: 36.8121, longitude: 34.6415 };

export type DriverLocationFix = { latitude: number; longitude: number };

/**
 * Sürücü konum takibi.
 *
 * Çevrim içiyken tarayıcı konumu izlenir ve {@link DRIVER_LOCATION_INTERVAL_SECONDS}
 * saniyede bir sunucuya gönderilir. GPS geç gelse veya reddedilse bile son bilinen
 * / yedek konum hemen yazılır; aksi halde sürücü dispatch defterine hiç girmez.
 * Birincil yol açık WebSocket'tir; soket kapalıysa REST yedeği kullanılır.
 */
export function useDriverLocation(
  enabled: boolean,
  socket?: DriverSocket | null,
  rideId?: string | null,
  seed?: DriverLocationFix | null,
) {
  const { authorizedFetch } = useAuth();
  const [location, setLocation] = useState<DriverLocationFix>(seed ?? fallback);
  const [heading, setHeading] = useState<number | undefined>();
  const [gpsOk, setGpsOk] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const lastSent = useRef(0);
  const locationRef = useRef(location);
  locationRef.current = location;
  const fetcher = useRef(authorizedFetch);
  fetcher.current = authorizedFetch;
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const rideRef = useRef(rideId);
  rideRef.current = rideId;
  const headingRef = useRef(heading);
  headingRef.current = heading;

  useEffect(() => {
    if (seed && !gpsOk) {
      setLocation((current) =>
        current.latitude === seed.latitude && current.longitude === seed.longitude ? current : seed,
      );
    }
  }, [seed?.latitude, seed?.longitude, gpsOk]);

  useEffect(() => {
    if (!enabled) {
      setGpsOk(false);
      return;
    }

    const lastPinged = { current: null as DriverLocationFix | null };
    const movedEnough = (next: DriverLocationFix) => {
      const previous = lastPinged.current;
      if (!previous) return true;
      return Math.abs(previous.latitude - next.latitude) > 0.0004 || Math.abs(previous.longitude - next.longitude) > 0.0004;
    };
    const ping = (next: DriverLocationFix, extras?: { heading?: number; speedMps?: number; accuracyMeters?: number }) => {
      const now = Date.now();
      if (!movedEnough(next) && now - lastSent.current < DRIVER_LOCATION_INTERVAL_SECONDS * 1000) return;
      lastSent.current = now;
      lastPinged.current = next;
      const heading = extras?.heading ?? headingRef.current;
      const payload = {
        ...next,
        ...(Number.isFinite(heading) && heading != null && heading >= 0 && heading <= 360 ? { heading } : {}),
        ...(extras?.speedMps != null && Number.isFinite(extras.speedMps) ? { speedMps: extras.speedMps } : {}),
        ...(extras?.accuracyMeters != null && Number.isFinite(extras.accuracyMeters)
          ? { accuracyMeters: Math.min(5000, Math.max(0, extras.accuracyMeters)) }
          : {}),
        ...(rideRef.current ? { rideId: rideRef.current } : {}),
      };
      if (!socketRef.current?.sendLocation(payload))
        void driverApi.reportLocation(fetcher.current, payload).catch(() => undefined);
    };

    lastSent.current = 0;
    ping(locationRef.current);

    const interval = window.setInterval(() => ping(locationRef.current), DRIVER_LOCATION_INTERVAL_SECONDS * 1000);

    if (!navigator.geolocation) {
      setLocationError("Bu tarayıcı konum paylaşmıyor; teklifler yedek konuma göre gider.");
      return () => window.clearInterval(interval);
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation(next);
        setHeading(position.coords.heading ?? undefined);
        setGpsOk(true);
        setLocationError(null);
        ping(next, {
          ...(position.coords.heading != null ? { heading: position.coords.heading } : {}),
          ...(position.coords.speed != null ? { speedMps: Math.max(0, position.coords.speed) } : {}),
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => {
        setGpsOk(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Konum izni kapalı. Yakındaki çağrıları almak için tarayıcı konumuna izin ver."
            : "Konum alınamadı. Teklifler son bilinen veya yedek konuma göre gider.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => {
      window.clearInterval(interval);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  return { location, heading, gpsOk, locationError };
}
