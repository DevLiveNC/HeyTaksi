import { useEffect, useRef } from "react";
import { DEFAULT_MAP_CENTER, useAuth, useDeviceLocation } from "@heytaksi/ui";
import { DRIVER_LOCATION_INTERVAL_SECONDS } from "@heytaksi/shared";
import { driverApi } from "../services/driverApi";
import type { DriverSocket } from "../services/rideSocket";

export type DriverLocationFix = { latitude: number; longitude: number };

/**
 * Sürücü konum takibi.
 *
 * GPS {@link useDeviceLocation} üzerinden gelir (izin tıklama jestinde istenir).
 * Çevrim içiyken {@link DRIVER_LOCATION_INTERVAL_SECONDS} saniyede bir sunucuya
 * gönderilir. Sahte şehir merkezi raporlanmaz; GPS yoksa yalnızca sunucudaki
 * son bilinen konum (seed) kullanılır ki sürücü dispatch defterine girebilsin.
 */
export function useDriverLocation(
  enabled: boolean,
  socket?: DriverSocket | null,
  rideId?: string | null,
  seed?: DriverLocationFix | null,
) {
  const geo = useDeviceLocation();
  const { authorizedFetch } = useAuth();
  const lastSent = useRef(0);
  const fetcher = useRef(authorizedFetch);
  fetcher.current = authorizedFetch;
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const rideRef = useRef(rideId);
  rideRef.current = rideId;
  const gpsRef = useRef(geo.location);
  gpsRef.current = geo.location;
  const seedRef = useRef(seed ?? null);
  seedRef.current = seed ?? null;
  const headingRef = useRef(geo.heading);
  headingRef.current = geo.heading;

  useEffect(() => {
    if (!enabled) return;

    const lastPinged = { current: null as DriverLocationFix | null };
    const movedEnough = (next: DriverLocationFix) => {
      const previous = lastPinged.current;
      if (!previous) return true;
      return Math.abs(previous.latitude - next.latitude) > 0.0004 || Math.abs(previous.longitude - next.longitude) > 0.0004;
    };
    const ping = (
      next: DriverLocationFix,
      extras?: { heading?: number; speedMps?: number; accuracyMeters?: number },
    ) => {
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

    const source = () => gpsRef.current ?? seedRef.current;
    lastSent.current = 0;
    const first = source();
    if (first) {
      ping(
        { latitude: first.latitude, longitude: first.longitude },
        gpsRef.current
          ? {
              ...(gpsRef.current.heading != null ? { heading: gpsRef.current.heading } : {}),
              ...(gpsRef.current.speedMps != null ? { speedMps: gpsRef.current.speedMps } : {}),
              ...(gpsRef.current.accuracyMeters != null ? { accuracyMeters: gpsRef.current.accuracyMeters } : {}),
            }
          : undefined,
      );
    }

    const interval = window.setInterval(() => {
      const next = source();
      if (!next) return;
      ping(
        { latitude: next.latitude, longitude: next.longitude },
        gpsRef.current
          ? {
              ...(gpsRef.current.heading != null ? { heading: gpsRef.current.heading } : {}),
              ...(gpsRef.current.speedMps != null ? { speedMps: gpsRef.current.speedMps } : {}),
              ...(gpsRef.current.accuracyMeters != null ? { accuracyMeters: gpsRef.current.accuracyMeters } : {}),
            }
          : undefined,
      );
    }, DRIVER_LOCATION_INTERVAL_SECONDS * 1000);

    return () => window.clearInterval(interval);
  }, [enabled]);

  const location = geo.location ?? seed ?? DEFAULT_MAP_CENTER;

  return {
    location,
    heading: geo.heading,
    gpsOk: geo.hasFix,
    locationError: geo.error,
    permission: geo.permission,
    hasFix: geo.hasFix,
    blocked: geo.blocked,
    loading: geo.loading,
    request: geo.request,
  };
}
