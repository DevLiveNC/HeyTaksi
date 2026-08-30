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

/**
 * İlk düzeltme: kullanıcı jestinde getCurrentPosition. Cached Wi-Fi konumu
 * kabul edilir ki izin verildikten sonra dakikalarca beklenmesin.
 */
export const GEO_FIRST_FIX_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 15_000,
};

/**
 * Sürekli izleme. `timeout` özellikle yok: tarayıcılar watchPosition'da
 * timeout'u her yeni okumaya uygular; maximumAge dolunca (eski 5 sn)
 * TIMEOUT basıp 1 sn sonra tekrar başarılı konum döndürürdü.
 */
export const GEO_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
};

/** ~11 m; GPS titremesi state/harita güncellemesin. */
export const GEO_MOVE_EPSILON_DEG = 0.0001;
/** ~12°; sürücü iğnesi her mikro heading değişiminde dönmesin. */
export const GEO_HEADING_EPSILON_DEG = 12;

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
  error: { code: number },
  previous: GeoPermission,
): GeoPermission {
  if (error.code === 1) return 'denied';
  return previous === 'granted' ? 'granted' : previous;
}

/**
 * Permissions API bazen watch yeniden başlarken `prompt` yayınlar.
 * Verilmiş izni veya eldeki düzeltmeyi düşürmeyiz; aksi halde tam ekran
 * kapı her birkaç saniyede bir açılıp tıklamaları yutar.
 */
export function mergeGeoPermission(
  current: GeoPermission,
  incoming: GeoPermission,
  hasFix: boolean,
): GeoPermission {
  if (incoming === 'denied' || incoming === 'unsupported') return incoming;
  if (incoming === 'granted') return 'granted';
  if (current === 'granted' || hasFix) return current === 'granted' ? 'granted' : current;
  return incoming;
}

/**
 * Kapı yalnızca gerçekten jest/izin gerektiğinde açılır.
 * Elde konum varken veya izin granted iken TIMEOUT overlay'i gösterilmez.
 */
export function locationPermissionBlocked(permission: GeoPermission, hasFix = false): boolean {
  if (permission === 'denied' || permission === 'unsupported') return true;
  if (permission === 'granted' || hasFix) return false;
  return true;
}

export function isTransientGeoError(error: { code: number } | null | undefined): boolean {
  return Boolean(error && (error.code === 2 || error.code === 3));
}

export function geoErrorMessage(
  permission: GeoPermission,
  error: { code: number } | null,
  hasFix: boolean,
): string | null {
  if (permission === 'unsupported') {
    return typeof window !== 'undefined' && window.isSecureContext
      ? 'Bu tarayıcı konum paylaşımını desteklemiyor.'
      : 'Konum için güvenli bağlantı (HTTPS) gerekir.';
  }
  if (permission === 'denied') {
    return 'Konum izni tarayıcıda kapalı. Adres çubuğundaki kilit simgesinden Konum’a izin ver, ardından tekrar dene.';
  }
  if (hasFix && isTransientGeoError(error)) return null;
  if (error && error.code === 3) return 'Konum alınamadı. Açık havada tekrar dene.';
  if (error && error.code === 2) return 'Konum sinyali yok. Konum servislerini açıp tekrar dene.';
  return null;
}

export function readDeviceLocation(position: GeolocationPosition): DeviceLocation {
  const { latitude, longitude, accuracy, heading, speed } = position.coords;
  const next: DeviceLocation = { latitude, longitude };
  if (Number.isFinite(accuracy)) next.accuracyMeters = accuracy;
  if (heading != null && Number.isFinite(heading)) next.heading = heading;
  if (speed != null && Number.isFinite(speed) && speed >= 0) next.speedMps = speed;
  return next;
}

export function coordinatesClose(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  epsilon = GEO_MOVE_EPSILON_DEG,
): boolean {
  return Math.abs(a.latitude - b.latitude) < epsilon && Math.abs(a.longitude - b.longitude) < epsilon;
}

export function headingClose(a: number | undefined, b: number | undefined, epsilon = GEO_HEADING_EPSILON_DEG): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta) < epsilon;
}

/** GPS titremesini state güncellemesine çevirme. */
export function deviceLocationUnchanged(previous: DeviceLocation, next: DeviceLocation): boolean {
  return coordinatesClose(previous, next) && headingClose(previous.heading, next.heading);
}
