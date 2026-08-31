import {
  DEFAULT_MAP_CENTER,
  KKTC_MAP_MIN_ZOOM,
  MAP_LABEL_LANGUAGE,
  OSM_DARK_STYLE_URL,
  OSM_LIGHT_STYLE_URL,
  kktcMapMaxBoundsLngLat,
} from '@heytaksi/shared';

export {
  DEFAULT_MAP_CENTER,
  KKTC_MAP_MIN_ZOOM,
  MAP_LABEL_LANGUAGE,
  OSM_DARK_STYLE_URL,
  OSM_LIGHT_STYLE_URL,
  kktcGoogleLatLngBounds,
  kktcMapMaxBoundsLngLat,
} from '@heytaksi/shared';

type ViteEnv = { env?: Record<string, string | undefined> };

function viteVar(name: string): string {
  try {
    return ((import.meta as ViteEnv).env?.[name] ?? '').trim();
  } catch {
    return '';
  }
}

/** Google yalnızca açıkça seçilirse kullanılır; varsayılan OSM/MapLibre. */
export function preferredMapProvider(): 'google' | 'osm' {
  return viteVar('VITE_MAP_PROVIDER').toLowerCase() === 'google' ? 'google' : 'osm';
}

export function osmStyleUrl(variant: 'light' | 'dark' = 'light'): string {
  return viteVar('VITE_MAP_STYLE_URL') || (variant === 'dark' ? OSM_DARK_STYLE_URL : OSM_LIGHT_STYLE_URL);
}

export function defaultMapLngLat(
  point: { latitude: number; longitude: number } = DEFAULT_MAP_CENTER,
): [number, number] {
  return [point.longitude, point.latitude];
}

/** KKTC kamera kısıtı: üç uygulamadaki MapLibre init bu seçenekleri paylaşır. */
export function osmKktcMapView(
  center: { latitude: number; longitude: number } = DEFAULT_MAP_CENTER,
): {
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxBounds: [[number, number], [number, number]];
} {
  return {
    center: defaultMapLngLat(center),
    zoom: 13,
    minZoom: KKTC_MAP_MIN_ZOOM,
    maxBounds: kktcMapMaxBoundsLngLat(),
  };
}

/**
 * Vektör stil yüklenemezse küresel raster OSM (Carto Voyager).
 * Kafe / market ikonları raster katmanda da görünür.
 */
export const OSM_RASTER_FALLBACK_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap katkıda bulunanları © CARTO',
      maxzoom: 20,
    },
  },
  layers: [{ id: 'osm-raster', type: 'raster' as const, source: 'osm' }],
};

const TURKISH_NAME_FIELD = [
  'coalesce',
  ['get', `name:${MAP_LABEL_LANGUAGE}`],
  ['get', 'name:latin'],
  ['get', 'name'],
];

export interface OsmMapLike {
  getStyle(): {
    layers?: Array<{
      id: string;
      type?: string;
      minzoom?: number;
      layout?: Record<string, unknown>;
    }>;
  };
  setLayoutProperty(id: string, key: string, value: unknown): void;
  setLayerZoomRange?(id: string, minzoom: number, maxzoom: number): void;
}

const POI_MIN_ZOOM: Record<string, number> = {
  poi_r1: 12,
  poi_r7: 13,
  poi_r20: 14,
  poi_transit: 12,
};

/**
 * Liberty stilindeki etiketleri Türkçe `name:tr` öncelikli yapar ve
 * kafe/market POI katmanlarını taksi yakınlaştırma seviyesinde görünür kılar.
 */
export function enhanceOsmMap(map: OsmMapLike): void {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const field = layer.layout?.['text-field'];
    if (field && JSON.stringify(field).includes('name')) {
      map.setLayoutProperty(layer.id, 'text-field', TURKISH_NAME_FIELD);
    }
    const poiMin = POI_MIN_ZOOM[layer.id];
    if (poiMin != null) map.setLayerZoomRange?.(layer.id, poiMin, 24);
  }
}

export function bindOsmStyleFallback(
  map: {
    on(type: string, listener: (event?: { error?: { status?: number } }) => void): void;
    setStyle(style: unknown): void;
    isStyleLoaded(): boolean | void;
  },
  onFailed?: () => void,
): void {
  let applied = false;
  map.on('error', () => {
    if (applied || map.isStyleLoaded()) return;
    applied = true;
    onFailed?.();
    map.setStyle(OSM_RASTER_FALLBACK_STYLE);
  });
}
