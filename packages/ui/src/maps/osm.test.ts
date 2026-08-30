import { describe, expect, it } from 'vitest';
import { enhanceOsmMap, preferredMapProvider, type OsmMapLike } from './osm';

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
