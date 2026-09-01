import { useCallback, useMemo, useRef } from "react";
import { isInKktcServiceArea, type Coordinate } from "@heytaksi/shared";
import { LIVE_PICKUP_ADDRESS, useDeviceLocation } from "@heytaksi/ui";

function toPickup(point: { latitude: number; longitude: number }): Coordinate | null {
  if (!isInKktcServiceArea(point.latitude, point.longitude)) return null;
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    address: LIVE_PICKUP_ADDRESS,
  };
}

/**
 * Yolcu konumu. Tarayıcı izni {@link useDeviceLocation} ile paylaşılır.
 * KKTC dışındaki GPS alış noktası olarak kullanılmaz; harita Lefkoşa’da kalır.
 */
export function useCurrentLocation() {
  const geo = useDeviceLocation();
  const inServiceArea = Boolean(
    geo.location && isInKktcServiceArea(geo.location.latitude, geo.location.longitude),
  );
  const location: Coordinate | null = useMemo(() => {
    if (!geo.location || !inServiceArea) return null;
    return toPickup(geo.location);
  }, [geo.location, inServiceArea]);
  const locationRef = useRef(location);
  locationRef.current = location;

  const requestPickup = useCallback(async (): Promise<Coordinate | null> => {
    const fix = await geo.request();
    if (fix) return toPickup(fix);
    return locationRef.current;
  }, [geo]);

  return {
    location,
    outsideServiceArea: geo.hasFix && !inServiceArea,
    isFallback: !geo.hasFix,
    permission: geo.permission,
    loading: geo.loading,
    error: geo.error,
    request: geo.request,
    requestPickup,
    blocked: geo.blocked,
    hasFix: geo.hasFix,
  };
}
