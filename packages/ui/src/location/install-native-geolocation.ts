import { detectNativeShell } from '@heytaksi/shared';

type NativeCoords = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
};

type NativePosition = {
  timestamp: number;
  coords: NativeCoords;
};

type NativeGeolocationPlugin = {
  getCurrentPosition(options?: PositionOptions): Promise<NativePosition>;
  watchPosition(
    options: PositionOptions,
    callback: (position: NativePosition | null, error?: { code?: number; message?: string }) => void,
  ): Promise<string>;
  clearWatch(options: { id: string }): Promise<void>;
  requestPermissions?: () => Promise<{ location?: string }>;
};

type CapacitorHost = {
  isNativePlatform?: () => boolean;
  Plugins?: { Geolocation?: NativeGeolocationPlugin };
};

function nativeGeolocation(win: Window): NativeGeolocationPlugin | null {
  const cap = (win as Window & { Capacitor?: CapacitorHost }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Geolocation ?? null;
}

function toBrowserPosition(position: NativePosition): GeolocationPosition {
  const { latitude, longitude, accuracy = 0, altitude = null, altitudeAccuracy = null, heading = null, speed = null } =
    position.coords;
  const coords = {
    latitude,
    longitude,
    accuracy,
    altitude,
    altitudeAccuracy,
    heading,
    speed,
    toJSON() {
      return this;
    },
  } satisfies GeolocationCoordinates;
  return {
    coords,
    timestamp: position.timestamp || Date.now(),
    toJSON() {
      return this;
    },
  } as GeolocationPosition;
}

function toBrowserError(error?: { code?: number; message?: string }): GeolocationPositionError {
  const code = error?.code === 1 || error?.code === 2 || error?.code === 3 ? error.code : 2;
  return {
    code,
    message: error?.message ?? 'Konum alınamadı.',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

/**
 * Capacitor Geolocation eklentisini `navigator.geolocation` gibi gösterir.
 * Mevcut DeviceLocationContext / web testleri tarayıcı API'sini kullanmaya devam eder.
 */
export function installNativeGeolocation(win: Window = window): boolean {
  const plugin = nativeGeolocation(win);
  if (!plugin) return false;
  const watches = new Map<number, string>();
  let nextId = 1;
  const api: Geolocation = {
    getCurrentPosition(success, error, options) {
      void plugin
        .requestPermissions?.()
        .catch(() => undefined)
        .then(() => plugin.getCurrentPosition(options))
        .then((position) => success(toBrowserPosition(position)))
        .catch((cause: { code?: number; message?: string }) => error?.(toBrowserError(cause)));
    },
    watchPosition(success, error, options) {
      const numericId = nextId++;
      void plugin
        .watchPosition(options ?? {}, (position, cause) => {
          if (cause) error?.(toBrowserError(cause));
          else if (position) success(toBrowserPosition(position));
        })
        .then((callbackId) => {
          watches.set(numericId, callbackId);
        })
        .catch((cause: { code?: number; message?: string }) => error?.(toBrowserError(cause)));
      return numericId;
    },
    clearWatch(id) {
      const callbackId = watches.get(id);
      if (!callbackId) return;
      watches.delete(id);
      void plugin.clearWatch({ id: callbackId });
    },
  };
  Object.defineProperty(win.navigator, 'geolocation', { configurable: true, value: api });
  return true;
}

export function nativeGeolocationAvailable(win: Window = window): boolean {
  return nativeGeolocation(win) != null || detectNativeShell(win);
}
