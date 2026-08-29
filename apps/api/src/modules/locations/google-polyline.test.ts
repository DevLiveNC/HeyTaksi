import { describe, expect, it } from 'vitest';
import { decodeGooglePolyline } from './google-polyline.js';

describe('Google polyline çözücü', () => {
  it('belgelenen örnek polylini [lng, lat] GeoJSON noktalarına çevirir', () => {
    // Google Encoded Polyline dokümantasyon örneği.
    const coordinates = decodeGooglePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(coordinates).toHaveLength(3);
    expect(coordinates[0]![1]).toBeCloseTo(38.5, 3);
    expect(coordinates[0]![0]).toBeCloseTo(-120.2, 3);
    expect(coordinates[1]![1]).toBeCloseTo(40.7, 3);
    expect(coordinates[1]![0]).toBeCloseTo(-120.95, 3);
    expect(coordinates[2]![1]).toBeCloseTo(43.252, 3);
    expect(coordinates[2]![0]).toBeCloseTo(-126.453, 3);
  });

  it('boş girdi boş dizi döner', () => {
    expect(decodeGooglePolyline('')).toEqual([]);
  });
});
