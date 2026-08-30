import { useEffect, useRef } from "react";
import { useAuth, useDeviceLocation } from "@heytaksi/ui";
import { DRIVER_LOCATION_INTERVAL_SECONDS } from "@heytaksi/shared";
import { driverApi } from "../services/driverApi";
import type { DriverSocket } from "../services/rideSocket";

/**
 * Sürücü konum takibi.
 *
 * Konum izni ve GPS {@link useDeviceLocation} üzerinden gelir. Çevrim içiyken
 * {@link DRIVER_LOCATION_INTERVAL_SECONDS} saniyede bir sunucuya gönderilir.
 * Sahte varsayılan koordinat asla raporlanmaz.
 */
export function useDriverLocation(enabled: boolean, socket?: DriverSocket | null, rideId?: string | null) {
  const geo = useDeviceLocation();
  const { authorizedFetch } = useAuth();
  const lastSent = useRef(0);
  const fetcher = useRef(authorizedFetch);
  fetcher.current = authorizedFetch;
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const rideRef = useRef(rideId);
  rideRef.current = rideId;
  const locationRef = useRef(geo.location);
  locationRef.current = geo.location;

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const loc = locationRef.current;
      if (!loc) return;
      const now = Date.now();
      if (now - lastSent.current < DRIVER_LOCATION_INTERVAL_SECONDS * 1000) return;
      lastSent.current = now;
      const ping = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        ...(loc.heading != null ? { heading: loc.heading } : {}),
        ...(loc.speedMps != null ? { speedMps: Math.max(0, loc.speedMps) } : {}),
        ...(loc.accuracyMeters != null ? { accuracyMeters: loc.accuracyMeters } : {}),
        ...(rideRef.current ? { rideId: rideRef.current } : {}),
      };
      if (!socketRef.current?.sendLocation(ping))
        void driverApi.reportLocation(fetcher.current, ping).catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, DRIVER_LOCATION_INTERVAL_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return {
    location: geo.location,
    heading: geo.heading,
    permission: geo.permission,
    hasFix: geo.hasFix,
    blocked: geo.blocked,
    loading: geo.loading,
    request: geo.request,
  };
}
