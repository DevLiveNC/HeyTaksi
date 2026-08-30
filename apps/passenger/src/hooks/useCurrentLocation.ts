import { useMemo } from "react";
import type { Coordinate } from "@heytaksi/shared";
import { useDeviceLocation } from "@heytaksi/ui";

/**
 * Yolcu konumu. Tarayıcı izni {@link useDeviceLocation} ile paylaşılır;
 * gerçek GPS gelene kadar sahte bir şehir merkezi döndürülmez.
 */
export function useCurrentLocation() {
  const geo = useDeviceLocation();
  const location: Coordinate | null = useMemo(
    () =>
      geo.location
        ? {
            latitude: geo.location.latitude,
            longitude: geo.location.longitude,
            address: "Mevcut konum",
          }
        : null,
    [geo.location],
  );

  return {
    location,
    isFallback: !geo.hasFix,
    permission: geo.permission,
    loading: geo.loading,
    request: geo.request,
    blocked: geo.blocked,
  };
}
