import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  GEO_WATCH_OPTIONS,
  acquireDeviceFix,
  deviceLocationUnchanged,
  geolocationSupported,
  geoErrorMessage,
  isTransientGeoError,
  locationPermissionBlocked,
  mergeGeoPermission,
  permissionFromPositionError,
  queryGeoPermission,
  readDeviceLocation,
  type DeviceLocation,
  type GeoPermission,
} from './geolocation';

interface DeviceLocationValue {
  permission: GeoPermission;
  location: DeviceLocation | null;
  heading: number | undefined;
  loading: boolean;
  error: string | null;
  hasFix: boolean;
  blocked: boolean;
  /** Tarayıcı konum iznini ister. Tıklama işleyicisinde senkron çağrılmalıdır. */
  request(): Promise<boolean>;
}

const DeviceLocationContext = createContext<DeviceLocationValue | null>(null);
const MEMORY_KEY = 'heytaksi.geo.permission';
const FIX_KEY = 'heytaksi.geo.lastFix';

function readRememberedPermission(): GeoPermission {
  try {
    const value = sessionStorage.getItem(MEMORY_KEY);
    if (value === 'granted' || value === 'denied' || value === 'prompt' || value === 'unsupported') return value;
  } catch {
    /* gizli sekme */
  }
  return 'unknown';
}

function rememberPermission(state: GeoPermission) {
  try {
    sessionStorage.setItem(MEMORY_KEY, state);
  } catch {
    /* gizli sekme */
  }
}

function readRememberedFix(): DeviceLocation | null {
  try {
    const raw = sessionStorage.getItem(FIX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeviceLocation>;
    if (
      typeof parsed.latitude === 'number' &&
      Number.isFinite(parsed.latitude) &&
      typeof parsed.longitude === 'number' &&
      Number.isFinite(parsed.longitude)
    ) {
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        ...(typeof parsed.accuracyMeters === 'number' && Number.isFinite(parsed.accuracyMeters)
          ? { accuracyMeters: parsed.accuracyMeters }
          : {}),
      };
    }
  } catch {
    /* gizli sekme veya bozuk kayıt */
  }
  return null;
}

function rememberFix(location: DeviceLocation) {
  try {
    sessionStorage.setItem(
      FIX_KEY,
      JSON.stringify({
        latitude: location.latitude,
        longitude: location.longitude,
        ...(location.accuracyMeters != null ? { accuracyMeters: location.accuracyMeters } : {}),
      }),
    );
  } catch {
    /* gizli sekme */
  }
}

function forgetFix() {
  try {
    sessionStorage.removeItem(FIX_KEY);
  } catch {
    /* gizli sekme */
  }
}

function initialLocation(): DeviceLocation | null {
  return readRememberedPermission() === 'granted' ? readRememberedFix() : null;
}

export function DeviceLocationProvider({ children }: PropsWithChildren) {
  const [permission, setPermissionState] = useState<GeoPermission>(readRememberedPermission);
  const setPermission = useCallback((next: GeoPermission | ((current: GeoPermission) => GeoPermission)) => {
    setPermissionState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      rememberPermission(value);
      return value;
    });
  }, []);
  const [location, setLocation] = useState<DeviceLocation | null>(initialLocation);
  const [heading, setHeading] = useState<number | undefined>();
  const [loading, setLoading] = useState(() => readRememberedPermission() === 'granted' && initialLocation() == null);
  const [positionError, setPositionError] = useState<GeolocationPositionError | null>(null);
  const watchId = useRef<number | null>(null);
  const permissionStatus = useRef<PermissionStatus | null>(null);
  const locationRef = useRef<DeviceLocation | null>(location);
  const permissionRef = useRef(permission);
  const inFlightFix = useRef<Promise<boolean> | null>(null);
  permissionRef.current = permission;
  locationRef.current = location;

  const applyIncomingPermission = useCallback(
    (incoming: GeoPermission) => {
      setPermission((current) => mergeGeoPermission(current, incoming, locationRef.current != null));
    },
    [setPermission],
  );

  const stopWatch = useCallback(() => {
    if (watchId.current == null || !navigator.geolocation) return;
    navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const applyPosition = useCallback(
    (position: GeolocationPosition) => {
      const next = readDeviceLocation(position);
      const previous = locationRef.current;
      if (previous && deviceLocationUnchanged(previous, next)) {
        setPermission('granted');
        setPositionError(null);
        return;
      }
      locationRef.current = next;
      rememberFix(next);
      setLocation(next);
      setHeading(next.heading);
      setPermission('granted');
      setPositionError(null);
    },
    [setPermission],
  );

  const clearLocation = useCallback(() => {
    locationRef.current = null;
    forgetFix();
    setLocation(null);
    setHeading(undefined);
  }, []);

  const onWatchError = useCallback(
    (error: GeolocationPositionError) => {
      if (error.code === 1) {
        setPositionError(error);
        setPermission('denied');
        clearLocation();
        stopWatch();
        setLoading(false);
        return;
      }
      setPermission((current) => permissionFromPositionError(error, current));
      // TIMEOUT / UNAVAILABLE: son düzeltmeyi koru, hata bandını yakıp söndürme.
      if (locationRef.current && isTransientGeoError(error)) return;
      setPositionError(error);
    },
    [clearLocation, setPermission, stopWatch],
  );

  const startWatch = useCallback(() => {
    if (!geolocationSupported()) {
      setPermission('unsupported');
      return;
    }
    if (watchId.current != null) return;
    watchId.current = navigator.geolocation.watchPosition(applyPosition, onWatchError, GEO_WATCH_OPTIONS);
  }, [applyPosition, onWatchError, setPermission]);

  const acquireFix = useCallback(
    (force = false) => {
      if (!geolocationSupported()) {
        setPermission('unsupported');
        return Promise.resolve(false);
      }
      if (locationRef.current && !force) return Promise.resolve(true);
      if (inFlightFix.current && !force) return inFlightFix.current;
      setLoading(true);
      setPositionError(null);
      const attempt = acquireDeviceFix()
        .then((position) => {
          applyPosition(position);
          return true;
        })
        .catch((error: { code?: number }) => {
          if (error?.code === 1) {
            onWatchError(error as GeolocationPositionError);
            return false;
          }
          if (locationRef.current) return true;
          setPositionError(error as GeolocationPositionError);
          setPermission((current) => permissionFromPositionError(error as { code: number }, current));
          return false;
        })
        .finally(() => {
          if (inFlightFix.current !== attempt) return;
          inFlightFix.current = null;
          setLoading(false);
        });
      inFlightFix.current = attempt;
      return attempt;
    },
    [applyPosition, onWatchError, setPermission],
  );

  const request = useCallback(() => {
    if (!geolocationSupported()) {
      setPermission('unsupported');
      return Promise.resolve(false);
    }
    // Jest aynı tıkta senkron kalmalı; mevcut izlemeyi kesme (kapı/izin flicker).
    startWatch();
    const attempt = acquireFix(true);
    void queryGeoPermission().then((state) => {
      if (state === 'denied') {
        setPermission('denied');
        clearLocation();
        stopWatch();
        setLoading(false);
      }
    });
    return attempt;
  }, [acquireFix, clearLocation, setPermission, startWatch, stopWatch]);

  useEffect(() => {
    let cancelled = false;
    if (readRememberedPermission() === 'granted') {
      startWatch();
      void acquireFix();
    }
    const attach = async () => {
      const state = await queryGeoPermission();
      if (cancelled) return;
      applyIncomingPermission(state);
      if (state === 'granted') {
        startWatch();
        void acquireFix();
      }
      if (state === 'denied' || state === 'unsupported') {
        clearLocation();
        stopWatch();
      }
      if (!navigator.permissions?.query) return;
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (cancelled) return;
        permissionStatus.current = status;
        status.onchange = () => {
          applyIncomingPermission(status.state);
          if (status.state === 'granted') {
            startWatch();
            void acquireFix();
          }
          if (status.state === 'denied') {
            clearLocation();
            setLoading(false);
            stopWatch();
          }
        };
      } catch {
        /* Safari ve bazı gömülü tarayıcılar geolocation Permission API sunmaz */
      }
    };
    void attach();
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      void queryGeoPermission().then((state) => {
        applyIncomingPermission(state);
        if (state === 'granted') {
          startWatch();
          void acquireFix();
        }
      });
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      if (permissionStatus.current) permissionStatus.current.onchange = null;
      stopWatch();
    };
  }, [acquireFix, applyIncomingPermission, clearLocation, startWatch, stopWatch]);

  const hasFix = location != null;
  const value = useMemo<DeviceLocationValue>(
    () => ({
      permission,
      location,
      heading,
      loading,
      error: geoErrorMessage(permission, positionError, hasFix),
      hasFix,
      blocked: locationPermissionBlocked(permission, hasFix),
      request,
    }),
    [permission, location, heading, loading, positionError, hasFix, request],
  );

  return <DeviceLocationContext.Provider value={value}>{children}</DeviceLocationContext.Provider>;
}

export function useDeviceLocation(): DeviceLocationValue {
  const value = useContext(DeviceLocationContext);
  if (!value) throw new Error('useDeviceLocation, DeviceLocationProvider içinde kullanılmalıdır.');
  return value;
}
