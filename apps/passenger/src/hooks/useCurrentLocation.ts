import { useMemo } from "react";
import { isInKktcServiceArea, type Coordinate } from "@heytaksi/shared";
import { useDeviceLocation } from "@heytaksi/ui";

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
    return {
      latitude: geo.location.latitude,
      longitude: geo.location.longitude,
      address: "Mevcut konum",
    };
  }, [geo.location, inServiceArea]);

  return {
    location,
    outsideServiceArea: geo.hasFix && !inServiceArea,
    isFallback: !geo.hasFix,
    permission: geo.permission,
    loading: geo.loading,
    error: geo.error,
    request: geo.request,
    blocked: geo.blocked,
    hasFix: geo.hasFix,
  };
}
