import { useCallback, useEffect, useState } from "react";
import type { Coordinate } from "@heytaksi/shared";
const fallback: Coordinate = {
  latitude: 36.8121,
  longitude: 34.6415,
  address: "Mersin merkez",
};
export function useCurrentLocation() {
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [permission, setPermission] = useState<PermissionState | "unsupported">(
    "prompt",
  );
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        setPermission(result.state);
        result.onchange = () => setPermission(result.state);
      })
      .catch(() => setPermission("prompt"));
  }, []);
  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setPermission("unsupported");
      setLocation(fallback);
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          address: "Mevcut konum",
        });
        setLoading(false);
      },
      () => {
        setPermission("denied");
        setLocation(fallback);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);
  return {
    location: location ?? fallback,
    isFallback: !location,
    permission,
    loading,
    request,
  };
}
