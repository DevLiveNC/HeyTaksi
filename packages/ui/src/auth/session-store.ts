import { detectNativeShell, nativeDevicePlatform, type NativeDevicePlatform } from '@heytaksi/shared';

const DEVICE_ID_KEY = 'heytaksi.device';

type PreferencesPlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

type CapacitorHost = {
  isNativePlatform?: () => boolean;
  Plugins?: { Preferences?: PreferencesPlugin };
};

function capacitorHost(win: Window): CapacitorHost | undefined {
  return (win as Window & { Capacitor?: CapacitorHost }).Capacitor;
}

export function nativePreferences(win: Window = window): PreferencesPlugin | null {
  const cap = capacitorHost(win);
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Preferences ?? null;
}

export function readLocal(key: string, win: Window = window): string | null {
  try {
    return win.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storedSessionValue(storageKey: string, win: Window = window): string | null {
  return readLocal(storageKey, win);
}

export function writeLocal(key: string, value: string | null, win: Window = window): void {
  try {
    if (value == null) win.localStorage.removeItem(key);
    else win.localStorage.setItem(key, value);
  } catch {
    /* gizli sekme / kota */
  }
}

export async function syncKeyedStorage(key: string, win: Window = window): Promise<void> {
  const prefs = nativePreferences(win);
  const local = readLocal(key, win);
  if (!prefs) return;
  const { value } = await prefs.get({ key });
  if (value && !local) writeLocal(key, value, win);
  else if (!value && local) await prefs.set({ key, value: local });
}

export function persistKeyedStorage(key: string, value: string | null, win: Window = window): void {
  writeLocal(key, value, win);
  const prefs = nativePreferences(win);
  if (!prefs) return;
  void (value == null ? prefs.remove({ key }) : prefs.set({ key, value }));
}

export function readOrCreateDeviceId(win: Window = window): string {
  let id = readLocal(DEVICE_ID_KEY, win);
  if (!id) {
    id = win.crypto.randomUUID();
    persistKeyedStorage(DEVICE_ID_KEY, id, win);
  }
  return id;
}

export function describeDevice(
  win: Window = window,
): { id: string; name: string; platform: NativeDevicePlatform } {
  const platform = nativeDevicePlatform(win);
  const mobile = win.navigator.userAgent.includes('Mobile');
  const name =
    platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : mobile ? 'Mobil web' : 'Web tarayıcı';
  return { id: readOrCreateDeviceId(win), name, platform };
}

export async function hydrateNativeStorage(storageKey: string, win: Window = window): Promise<void> {
  if (!detectNativeShell(win)) return;
  await syncKeyedStorage(storageKey, win);
  await syncKeyedStorage(DEVICE_ID_KEY, win);
}
