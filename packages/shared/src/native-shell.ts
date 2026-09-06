/**
 * Capacitor WebView ve üretim API varsayılanları.
 *
 * Android kabuğu `https://localhost`, iOS `capacitor://localhost` origin'i kullanır.
 * Bu origin'lerde Vite/Vercel `/api` proxy'si yoktur; istekler doğrudan API hostuna gitmelidir.
 */

export const PRODUCTION_API_ORIGIN = 'https://hey-taksi-api.vercel.app';
export const PRODUCTION_API_BASE = `${PRODUCTION_API_ORIGIN}/api/v1`;
export const PRODUCTION_WS_URL = `${PRODUCTION_API_ORIGIN.replace(/^http/, 'ws')}/ws`;

export type NativeDevicePlatform = 'ios' | 'android' | 'web';

type LocationLike = Pick<URL, 'protocol' | 'hostname'> & { port?: string };

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function capacitorFrom(win?: Window): CapacitorBridge | undefined {
  if (!win) return undefined;
  return (win as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

/** Origin Capacitor / Ionic kabuğuna mı ait? */
export function isNativeAppLocation(location: LocationLike): boolean {
  const protocol = location.protocol.replace(/:$/, '');
  if (protocol === 'capacitor' || protocol === 'ionic') return true;
  const port = location.port ?? '';
  return location.hostname === 'localhost' && protocol === 'https' && (port === '' || port === '443');
}

export function detectNativeShell(win?: Window): boolean {
  const target = win ?? (typeof window === 'undefined' ? undefined : window);
  const cap = capacitorFrom(target);
  if (cap?.isNativePlatform?.()) return true;
  if (!target) return false;
  try {
    return isNativeAppLocation(target.location);
  } catch {
    return false;
  }
}

export function nativeDevicePlatform(win?: Window): NativeDevicePlatform {
  const target = win ?? (typeof window === 'undefined' ? undefined : window);
  const cap = capacitorFrom(target);
  if (cap?.isNativePlatform?.()) {
    const platform = cap.getPlatform?.();
    if (platform === 'ios' || platform === 'android') return platform;
  }
  return 'web';
}
