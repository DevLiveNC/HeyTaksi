import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_CENTER, kktcViewboxParam } from '@heytaksi/shared';
import { buildNominatimReverseUrl, buildNominatimSearchUrl } from './nominatim.js';

describe('Nominatim OSM arama URL', () => {
  it('ülke kodu koymaz; küresel arama KKTC görünüm kutusuna ağırlık verir', () => {
    const url = buildNominatimSearchUrl('https://nominatim.openstreetmap.org', 'kafeterya');
    expect(url.searchParams.get('countrycodes')).toBeNull();
    expect(url.searchParams.get('q')).toBe('kafeterya');
    expect(url.searchParams.get('viewbox')).toBe(kktcViewboxParam());
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('namedetails')).toBe('1');
  });

  it('yakın konum varsa görünüm kutusunu o noktaya kaydırır', () => {
    const url = buildNominatimSearchUrl('https://nominatim.openstreetmap.org', 'market', {
      latitude: 35.3364,
      longitude: 33.3193,
    });
    expect(url.searchParams.get('viewbox')).toContain('32.8193');
    expect(url.searchParams.get('viewbox')).not.toBe(kktcViewboxParam());
  });

  it('ters geocode Türkçe ayrıntılı adres ister', () => {
    const url = buildNominatimReverseUrl(
      'https://nominatim.openstreetmap.org',
      DEFAULT_MAP_CENTER.latitude,
      DEFAULT_MAP_CENTER.longitude,
    );
    expect(url.searchParams.get('lat')).toBe(String(DEFAULT_MAP_CENTER.latitude));
    expect(url.searchParams.get('lon')).toBe(String(DEFAULT_MAP_CENTER.longitude));
    expect(url.searchParams.get('zoom')).toBe('18');
  });
});
