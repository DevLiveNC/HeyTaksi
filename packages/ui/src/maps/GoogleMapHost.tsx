import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { KKTC_MAP_MIN_ZOOM, kktcGoogleLatLngBounds } from '@heytaksi/shared';
import { googleMapsBrowserKey, isGoogleMapsConfigured, loadGoogleMaps, setGoogleMapsBrowserKey } from './loader';
import { preferredMapProvider } from './osm';
import { GOOGLE_MAP_DARK_STYLES, GOOGLE_MAP_LIGHT_STYLES } from './styles';
import type { GoogleMapsApi, LatLngLiteral } from './google-types';

const MapsKeyContext = createContext<string>(googleMapsBrowserKey());

export function MapsKeyProvider({
  children,
  resolveKey,
}: {
  children: ReactNode;
  resolveKey?: () => Promise<string | null | undefined>;
}) {
  const [key, setKey] = useState(googleMapsBrowserKey);
  useEffect(() => {
    if (key || !resolveKey) return;
    void resolveKey()
      .then((next) => {
        if (!next) return;
        setGoogleMapsBrowserKey(next);
        setKey(next);
      })
      .catch(() => undefined);
  }, [key, resolveKey]);
  return createElement(MapsKeyContext.Provider, { value: key }, children);
}

export function useMapsBrowserKey(): string {
  return useContext(MapsKeyContext) || googleMapsBrowserKey();
}

interface HostProps {
  center: LatLngLiteral;
  zoom?: number;
  dark?: boolean;
  className?: string;
  ariaLabel?: string;
  fallback: ReactNode;
  onClick?: (latitude: number, longitude: number) => void;
  onReady: (map: google.maps.Map, maps: GoogleMapsApi) => void;
}

/**
 * Google Maps JavaScript API eklentisi.
 * Varsayılan sağlayıcı OSM/MapLibre'dir (`fallback`). Google yalnızca
 * `VITE_MAP_PROVIDER=google` ve geçerli anahtar varken yüklenir.
 */
export function GoogleMapHost({
  center,
  zoom = 13,
  dark = false,
  className,
  ariaLabel = 'Harita',
  fallback,
  onClick,
  onReady,
}: HostProps) {
  const key = useMapsBrowserKey();
  const container = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const configured =
    preferredMapProvider() === 'google' && Boolean(key || isGoogleMapsConfigured());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!configured) {
      setFailed(false);
      return;
    }
    const node = container.current;
    if (!node) return;
    let cancelled = false;
    let clickListener: google.maps.MapsEventListener | null = null;
    void loadGoogleMaps(key || googleMapsBrowserKey()).then((g) => {
      if (cancelled || !container.current) return;
      if (!g?.maps) {
        setFailed(true);
        return;
      }
      setFailed(false);
      const map = new g.maps.Map(container.current, {
        center,
        zoom,
        minZoom: KKTC_MAP_MIN_ZOOM,
        restriction: { latLngBounds: kktcGoogleLatLngBounds(), strictBounds: false },
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        keyboardShortcuts: false,
        styles: dark ? GOOGLE_MAP_DARK_STYLES : GOOGLE_MAP_LIGHT_STYLES,
      });
      clickListener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
        const latLng = event.latLng;
        if (latLng) clickRef.current?.(latLng.lat(), latLng.lng());
      });
      readyRef.current(map, g.maps);
    });
    return () => {
      cancelled = true;
      clickListener?.remove();
    };
  }, [configured, dark]);

  if (!configured || failed) return fallback;
  return createElement('div', {
    ref: container,
    className,
    role: 'application',
    'aria-label': ariaLabel,
    style: { width: '100%', height: '100%', minHeight: 160 },
  });
}
