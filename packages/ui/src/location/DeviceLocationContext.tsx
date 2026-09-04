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
  /** Tarayıcı konum iznini ister. Tıklama işleyicisinde senkron çağrılmalıdır. Düzeltmeyi döndürür. */
  request(): Promise<DeviceLocation | null>;
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
  const watchEpoch = useRef(0);
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
    watchEpoch.current += 1;
    if (watchId.current == null || !navigator.geolocation) {
      watchId.current = null;
      return;
    }
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
        // getCurrentPosition sürerken gelen yalancı watch reddi, yeni verilen izni silmesin.
        if (inFlightFix.current) return;
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

  const startWatch = useCallback(
    (restart = false) => {
      if (!geolocationSupported()) {
        setPermission('unsupported');
        return;
      }
      if (watchId.current != null && !restart) return;
      if (watchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      const epoch = ++watchEpoch.current;
      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          if (epoch !== watchEpoch.current) return;
          applyPosition(position);
        },
        (error) => {
          if (epoch !== watchEpoch.current) return;
          onWatchError(error);
        },
        GEO_WATCH_OPTIONS,
      );
    },
    [applyPosition, onWatchError, setPermission],
  );

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
          // İzin kabulünden önce başlayan watch, yalancı denied basabilir; epoch yenilenir.
          startWatch(true);
          return true;
        })
        .catch((error: { code?: number }) => {
          if (error?.code === 1) {
            setPositionError(error as GeolocationPositionError);
            setPermission('denied');
            clearLocation();
            stopWatch();
            return false;
          }
          setPermission((current) => permissionFromPositionError(error as { code: number }, current));
          startWatch(true);
          if (locationRef.current) return true;
          setPositionError(error as GeolocationPositionError);
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
    [applyPosition, clearLocation, setPermission, startWatch, stopWatch],
  );

  const request = useCallback(async () => {
    if (!geolocationSupported()) {
      setPermission('unsupported');
      return null;
    }
    // Jest aynı tıkta senkron kalmalı. Eski denied izlemesini düşürüp yeniden bağla.
    startWatch(true);
    const ok = await acquireFix(true);
    return ok ? locationRef.current : null;
  }, [acquireFix, setPermission, startWatch]);

  useEffect(() => {
    let cancelled = false;
    if (readRememberedPermission() === 'granted') {
      startWatch();
      void acquireFix();
    }
    const recoverFromBrowserAllow = (state: GeoPermission, previouslyDenied: boolean) => {
      if (state === 'unsupported') {
        stopWatch();
        return;
      }
      if (state === 'granted') {
        startWatch();
        void acquireFix();
        return;
      }
      // Kilit menüsünden Allow sonrası API hâlâ prompt/unknown kalabilir.
      if (previouslyDenied && state !== 'denied') {
        startWatch(true);
        void acquireFix(true);
        return;
      }
      // Yalancı denied, elde granted/fix varken GPS ile doğrula; gerçek red kod 1’dir.
      if (state === 'denied' && (permissionRef.current === 'granted' || locationRef.current)) {
        void acquireFix(true);
      }
    };
    const attach = async () => {
      const state = await queryGeoPermission();
      if (cancelled) return;
      const wasDenied = permissionRef.current === 'denied';
      applyIncomingPermission(state);
      recoverFromBrowserAllow(state, wasDenied);
      if (!navigator.permissions?.query) return;
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (cancelled) return;
        permissionStatus.current = status;
        status.onchange = () => {
          const previouslyDenied = permissionRef.current === 'denied';
          applyIncomingPermission(status.state);
          recoverFromBrowserAllow(status.state, previouslyDenied);
        };
      } catch {
        /* Safari ve bazı gömülü tarayıcılar geolocation Permission API sunmaz */
      }
    };
    void attach();
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      void queryGeoPermission().then((state) => {
        const wasDenied = permissionRef.current === 'denied';
        applyIncomingPermission(state);
        recoverFromBrowserAllow(state, wasDenied);
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
  }, [acquireFix, applyIncomingPermission, startWatch, stopWatch]);

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
