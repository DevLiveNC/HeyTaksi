import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_CENTER,
  KKTC_PLACES,
  formatKktcAddress,
  isInKktcServiceArea,
  kktcMapMaxBoundsLngLat,
  kktcPlaceById,
  matchKktcPlaces,
} from '@heytaksi/shared';

describe('isInKktcServiceArea', () => {
  it('Lefkoşa, Girne, Karpaz, Ercan ve Gazimağusa içindedir', () => {
    expect(isInKktcServiceArea(DEFAULT_MAP_CENTER.latitude, DEFAULT_MAP_CENTER.longitude)).toBe(true);
    expect(isInKktcServiceArea(35.3417, 33.3192)).toBe(true);
    expect(isInKktcServiceArea(35.6, 34.4)).toBe(true);
    expect(isInKktcServiceArea(35.1547, 33.4961)).toBe(true);
    expect(isInKktcServiceArea(35.1264, 33.9375)).toBe(true);
    expect(isInKktcServiceArea(35.1983, 32.9939)).toBe(true);
    expect(isInKktcServiceArea(35.1119, 32.8503)).toBe(true);
  });

  it('Mersin, Larnaka, İstanbul ve Güney Lefkoşa dışındadır', () => {
    expect(isInKktcServiceArea(36.8121, 34.6415)).toBe(false);
    expect(isInKktcServiceArea(34.9229, 33.6233)).toBe(false);
    expect(isInKktcServiceArea(41.0082, 28.9784)).toBe(false);
    expect(isInKktcServiceArea(35.145, 33.365)).toBe(false);
  });
});

describe('KKTC katalog', () => {
  it('katalogdaki her yer hizmet alanı içindedir', () => {
    for (const place of KKTC_PLACES) {
      expect(isInKktcServiceArea(place.latitude, place.longitude), place.id).toBe(true);
    }
  });

  it('önek ve takma adla eşleşir', () => {
    expect(matchKktcPlaces('ercan').map((place) => place.id)).toContain('ercan');
    expect(matchKktcPlaces('kyrenia').map((place) => place.id)).toContain('girne');
    expect(matchKktcPlaces('YDÜ').map((place) => place.id)).toContain('ydu');
  });

  it('boş sorguda simge yapıları önerir', () => {
    const empty = matchKktcPlaces(' ');
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((place) => place.type === 'landmark')).toBe(true);
  });

  it('id ile yer bulur', () => {
    expect(kktcPlaceById('dereboyu')?.name).toBe('Dereboyu');
  });
});

describe('formatKktcAddress', () => {
  it('name:tr ve ilçeyi Türkçe KKTC adresine çevirir', () => {
    expect(
      formatKktcAddress({
        namedetails: { 'name:tr': 'Dereboyu', name: 'Dereboyu Avenue' },
        address: { suburb: 'Köşklüçiftlik', city: 'Nicosia', country: 'Cyprus' },
        displayName: 'Dereboyu Avenue, Nicosia, Cyprus',
      }),
    ).toBe('Dereboyu, Köşklüçiftlik, Lefkoşa, KKTC');
  });

  it('Cyprus etiketini KKTC ile değiştirir', () => {
    expect(formatKktcAddress({ displayName: 'Girne Harbour, Kyrenia, Cyprus' })).toMatch(/KKTC/);
    expect(formatKktcAddress({ displayName: 'Girne Harbour, Kyrenia, Cyprus' })).not.toMatch(/Cyprus/i);
  });
});

describe('kktcMapMaxBoundsLngLat', () => {
  it('MapLibre [sw, ne] sırasını döner', () => {
    const [southWest, northEast] = kktcMapMaxBoundsLngLat();
    expect(southWest[0]).toBeLessThan(northEast[0]);
    expect(southWest[1]).toBeLessThan(northEast[1]);
  });
});
