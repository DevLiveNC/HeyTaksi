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
  geolocationSupported,
  locationPermissionBlocked,
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

function errorMessage(permission: GeoPermission, error: GeolocationPositionError | null): string | null {
  if (permission === 'unsupported') {
    return window.isSecureContext
      ? 'Bu tarayıcı konum paylaşımını desteklemiyor.'
      : 'Konum için güvenli bağlantı (HTTPS) gerekir.';
  }
  if (permission === 'denied') {
    return 'Konum izni tarayıcıda kapalı. Adres çubuğundaki kilit simgesinden Konum’a izin ver, ardından tekrar dene.';
  }
  if (error && error.code === 3) return 'Konum alınamadı. Açık havada tekrar dene.';
  if (error && error.code === 2) return 'Konum sinyali yok. Konum servislerini açıp tekrar dene.';
  return null;
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

  const stopWatch = useCallback(() => {
    if (watchId.current == null || !navigator.geolocation) return;
    navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const applyPosition = useCallback((position: GeolocationPosition) => {
    const next = readDeviceLocation(position);
    setLocation(next);
    setHeading(next.heading);
    setPermission('granted');
    setPositionError(null);
  }, [setPermission]);

  const startWatch = useCallback(() => {
    if (!geolocationSupported()) {
      setPermission('unsupported');
      return;
    }
    if (watchId.current != null) return;
    watchId.current = navigator.geolocation.watchPosition(
      applyPosition,
      (error) => {
        setPositionError(error);
        setPermission((current) => permissionFromPositionError(error, current));
        if (error.code === 1) {
          setLocation(null);
          setHeading(undefined);
          stopWatch();
          setLoading(false);
        }
      },
      GEO_WATCH_OPTIONS,
    );
  }, [applyPosition, stopWatch]);

  const request = useCallback(() => {
    if (!geolocationSupported()) {
      setPermission('unsupported');
      return Promise.resolve(false);
    }
    setLoading(true);
    setPositionError(null);
    // Jest kaybolmasın: await etmeden hemen watch/getCurrentPosition.
    stopWatch();
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        setLoading(false);
        resolve(ok);
      };
      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          applyPosition(position);
          finish(true);
        },
        (error) => {
          setPositionError(error);
          setPermission((current) => permissionFromPositionError(error, current));
          if (error.code === 1) {
            setLocation(null);
            setHeading(undefined);
            stopWatch();
            finish(false);
            return;
          }
          finish(false);
        },
        GEO_WATCH_OPTIONS,
      );
      void queryGeoPermission().then((state) => {
        if (state === 'denied') {
          setPermission('denied');
          setLocation(null);
          stopWatch();
          finish(false);
        }
      });
    });
  }, [applyPosition, stopWatch]);

  useEffect(() => {
    let cancelled = false;
    if (readRememberedPermission() === 'granted') startWatch();
    const attach = async () => {
      const state = await queryGeoPermission();
      if (cancelled) return;
      setPermission((current) => {
        if (current === 'granted' && state !== 'denied' && state !== 'unsupported') return current;
        return state;
      });
      if (state === 'granted') startWatch();
      if (state === 'denied' || state === 'unsupported') {
        setLocation(null);
        stopWatch();
      }
      if (!navigator.permissions?.query) return;
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (cancelled) return;
        permissionStatus.current = status;
        status.onchange = () => {
          setPermission(status.state);
          if (status.state === 'granted') startWatch();
          if (status.state === 'denied') {
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
        setPermission((current) => {
          if (current === 'granted' && state !== 'denied' && state !== 'unsupported') return current;
          return state;
        });
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
  }, [startWatch, stopWatch]);

  const value = useMemo<DeviceLocationValue>(
    () => ({
      permission,
      location,
      heading,
      loading,
      error: errorMessage(permission, positionError),
      hasFix: location != null,
      blocked: locationPermissionBlocked(permission),
      request,
    }),
    [permission, location, heading, loading, positionError, request],
  );

  return <DeviceLocationContext.Provider value={value}>{children}</DeviceLocationContext.Provider>;
}

export function useDeviceLocation(): DeviceLocationValue {
  const value = useContext(DeviceLocationContext);
  if (!value) throw new Error('useDeviceLocation, DeviceLocationProvider içinde kullanılmalıdır.');
  return value;
}
