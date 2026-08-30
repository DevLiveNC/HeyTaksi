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
  GEO_FIRST_FIX_OPTIONS,
  GEO_WATCH_OPTIONS,
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

export function DeviceLocationProvider({ children }: PropsWithChildren) {
  const [permission, setPermissionState] = useState<GeoPermission>(readRememberedPermission);
  const setPermission = useCallback((next: GeoPermission | ((current: GeoPermission) => GeoPermission)) => {
    setPermissionState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      rememberPermission(value);
      return value;
    });
  }, []);
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [heading, setHeading] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [positionError, setPositionError] = useState<GeolocationPositionError | null>(null);
  const watchId = useRef<number | null>(null);
  const permissionStatus = useRef<PermissionStatus | null>(null);
  const locationRef = useRef<DeviceLocation | null>(null);
  const permissionRef = useRef(permission);
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
      setLocation(next);
      setHeading(next.heading);
      setPermission('granted');
      setPositionError(null);
    },
    [setPermission],
  );

  const onWatchError = useCallback(
    (error: GeolocationPositionError) => {
      if (error.code === 1) {
        setPositionError(error);
        setPermission('denied');
        locationRef.current = null;
        setLocation(null);
        setHeading(undefined);
        stopWatch();
        setLoading(false);
        return;
      }
      setPermission((current) => permissionFromPositionError(error, current));
      // TIMEOUT / UNAVAILABLE: son düzeltmeyi koru, hata bandını yakıp söndürme.
      if (locationRef.current && isTransientGeoError(error)) return;
      setPositionError(error);
    },
    [setPermission, stopWatch],
  );

  const startWatch = useCallback(() => {
    if (!geolocationSupported()) {
      setPermission('unsupported');
      return;
    }
    if (watchId.current != null) return;
    watchId.current = navigator.geolocation.watchPosition(applyPosition, onWatchError, GEO_WATCH_OPTIONS);
  }, [applyPosition, onWatchError, setPermission]);

  const request = useCallback(() => {
    if (!geolocationSupported()) {
      setPermission('unsupported');
      return Promise.resolve(false);
    }
    setLoading(true);
    setPositionError(null);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        setLoading(false);
        resolve(ok);
      };
      // Jest aynı tıkta senkron kalmalı; mevcut izlemeyi kesme (kapı/izin flicker).
      navigator.geolocation.getCurrentPosition(
        (position) => {
          applyPosition(position);
          finish(true);
        },
        (error) => {
          if (error.code === 1) {
            onWatchError(error);
            finish(false);
            return;
          }
          if (locationRef.current) {
            finish(true);
            return;
          }
          setPositionError(error);
          setPermission((current) => permissionFromPositionError(error, current));
          finish(false);
        },
        GEO_FIRST_FIX_OPTIONS,
      );
      if (watchId.current == null) {
        watchId.current = navigator.geolocation.watchPosition(applyPosition, onWatchError, GEO_WATCH_OPTIONS);
      }
      void queryGeoPermission().then((state) => {
        if (state === 'denied') {
          setPermission('denied');
          locationRef.current = null;
          setLocation(null);
          stopWatch();
          finish(false);
        }
      });
    });
  }, [applyPosition, onWatchError, setPermission, stopWatch]);

  useEffect(() => {
    let cancelled = false;
    if (readRememberedPermission() === 'granted') startWatch();
    const attach = async () => {
      const state = await queryGeoPermission();
      if (cancelled) return;
      applyIncomingPermission(state);
      if (state === 'granted') startWatch();
      if (state === 'denied' || state === 'unsupported') {
        locationRef.current = null;
        setLocation(null);
        stopWatch();
      }
      if (!navigator.permissions?.query) return;
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (cancelled) return;
        permissionStatus.current = status;
        status.onchange = () => {
          applyIncomingPermission(status.state);
          if (status.state === 'granted') startWatch();
          if (status.state === 'denied') {
            locationRef.current = null;
            setLocation(null);
            setHeading(undefined);
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
        if (state === 'granted') startWatch();
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
  }, [applyIncomingPermission, startWatch, stopWatch]);

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
