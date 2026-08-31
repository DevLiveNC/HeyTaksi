import { describe, expect, it, vi } from 'vitest';
import {
  enhanceOsmMap,
  preferredMapProvider,
  osmKktcMapView,
  shouldFallbackOsmStyle,
  bindOsmStyleFallback,
  OSM_RASTER_FALLBACK_STYLE,
  type OsmMapLike,
} from './osm';

describe('osmKktcMapView', () => {
  it('KKTC maxBounds ve minZoom verir', () => {
    const view = osmKktcMapView();
    expect(view.minZoom).toBe(8);
    expect(view.maxBounds[0][0]).toBeLessThan(view.maxBounds[1][0]);
    expect(view.center).toEqual([33.3823, 35.1856]);
  });
});

describe('preferredMapProvider', () => {
  it('Google anahtarı olsa bile varsayılan OSM kullanır', () => {
    expect(preferredMapProvider()).toBe('osm');
  });
});

describe('enhanceOsmMap', () => {
  it('name içeren etiketleri Türkçe öncelikli ifadeyle değiştirir, ref kalkanlarını dokunmaz', () => {
    const layoutUpdates: Array<[string, unknown]> = [];
    const zoomRanges: Array<[string, number, number]> = [];
    const map: OsmMapLike = {
      getStyle: () => ({
        layers: [
          {
            id: 'label_city',
            type: 'symbol',
            layout: { 'text-field': ['get', 'name:latin'] },
          },
          {
            id: 'highway-shield-non-us',
            type: 'symbol',
            layout: { 'text-field': ['to-string', ['get', 'ref']] },
          },
          { id: 'poi_r1', type: 'symbol', minzoom: 15, layout: { 'text-field': ['get', 'name'] } },
          { id: 'roads', type: 'line' },
        ],
      }),
      setLayoutProperty: (id, key, value) => {
        if (key === 'text-field') layoutUpdates.push([id, value]);
      },
      setLayerZoomRange: (id, minzoom, maxzoom) => {
        zoomRanges.push([id, minzoom, maxzoom]);
      },
    };

    enhanceOsmMap(map);

    expect(layoutUpdates.map(([id]) => id)).toEqual(['label_city', 'poi_r1']);
    expect(layoutUpdates[0]?.[1]).toEqual(['coalesce', ['get', 'name:tr'], ['get', 'name:latin'], ['get', 'name']]);
    expect(zoomRanges).toEqual([['poi_r1', 12, 24]]);
  });
});

describe('shouldFallbackOsmStyle', () => {
  it('stil yüklenmeden gelen hatada yedekler', () => {
    expect(shouldFallbackOsmStyle(false)).toBe(true);
  });

  it('stil yüklendikten sonra karo/worker hatasında yedekler', () => {
    expect(shouldFallbackOsmStyle(true, { status: 404 })).toBe(true);
    expect(shouldFallbackOsmStyle(true, { message: 'Failed to construct Worker' })).toBe(true);
  });

  it('ilgisiz stildeki hatayı yok sayar', () => {
    expect(shouldFallbackOsmStyle(true, { message: 'image missing' })).toBe(false);
  });
});

describe('bindOsmStyleFallback', () => {
  it('stil yüklenemezse raster OSM stilini uygular', () => {
    let errorListener: ((...args: unknown[]) => void) | undefined;
    const setStyle = vi.fn();
    bindOsmStyleFallback(
      {
        on: (_type, listener) => {
          errorListener = listener;
        },
        setStyle,
        isStyleLoaded: () => false,
      },
      undefined,
    );
    errorListener?.({ error: { status: 503 } });
    expect(setStyle).toHaveBeenCalledWith(OSM_RASTER_FALLBACK_STYLE);
  });
});
