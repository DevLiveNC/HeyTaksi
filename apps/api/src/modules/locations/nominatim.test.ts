import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_CENTER, kktcViewboxParam } from '@heytaksi/shared';
import { buildNominatimReverseUrl, buildNominatimSearchUrl, nominatimPlaceAddress } from './nominatim.js';

describe('Nominatim OSM arama URL', () => {
  it('KKTC görünüm kutusuna kilitler ve ülke kodu koymaz', () => {
    const url = buildNominatimSearchUrl('https://nominatim.openstreetmap.org', 'kafeterya');
    expect(url.searchParams.get('countrycodes')).toBeNull();
    expect(url.searchParams.get('q')).toBe('kafeterya');
    expect(url.searchParams.get('viewbox')).toBe(kktcViewboxParam());
    expect(url.searchParams.get('bounded')).toBe('1');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('namedetails')).toBe('1');
  });

  it('yakın konum viewbox’ı kaydırmaz', () => {
    const url = buildNominatimSearchUrl('https://nominatim.openstreetmap.org', 'market');
    expect(url.searchParams.get('viewbox')).toBe(kktcViewboxParam());
    expect(url.searchParams.get('bounded')).toBe('1');
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

  it('Nominatim adresini Türkçe KKTC biçimine çevirir', () => {
    expect(
      nominatimPlaceAddress({
        name: 'Girne Harbour',
        display_name: 'Girne Harbour, Kyrenia, Cyprus',
        namedetails: { 'name:tr': 'Girne Limanı', name: 'Girne Harbour' },
        address: { city: 'Kyrenia', country: 'Cyprus' },
      }),
    ).toBe('Girne Limanı, Girne, KKTC');
  });
});
