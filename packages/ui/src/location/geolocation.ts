/** Varsayılan harita merkezi (Mersin). Gerçek GPS yerine kullanılamaz. */
export const DEFAULT_MAP_CENTER = { latitude: 36.8121, longitude: 34.6415 };

export type GeoPermission = PermissionState | 'unknown' | 'unsupported';

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  heading?: number;
  speedMps?: number;
}

export const GEO_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 20_000,
};

export function geolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation) && window.isSecureContext;
}

export async function queryGeoPermission(): Promise<GeoPermission> {
  if (!geolocationSupported()) return 'unsupported';
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

export function permissionFromPositionError(
  error: GeolocationPositionError,
  previous: GeoPermission,
): GeoPermission {
  if (error.code === 1) return 'denied';
  return previous === 'granted' ? 'granted' : previous;
}

export function readDeviceLocation(position: GeolocationPosition): DeviceLocation {
  const { latitude, longitude, accuracy, heading, speed } = position.coords;
  const next: DeviceLocation = { latitude, longitude };
  if (Number.isFinite(accuracy)) next.accuracyMeters = accuracy;
  if (heading != null && Number.isFinite(heading)) next.heading = heading;
  if (speed != null && Number.isFinite(speed) && speed >= 0) next.speedMps = speed;
  return next;
}

export function locationPermissionBlocked(permission: GeoPermission): boolean {
  return permission !== 'granted';
}
