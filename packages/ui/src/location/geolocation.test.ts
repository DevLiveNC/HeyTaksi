import { describe, expect, it } from 'vitest';
import {
  deviceLocationUnchanged,
  geoErrorMessage,
  headingClose,
  isTransientGeoError,
  locationPermissionBlocked,
  mergeGeoPermission,
  permissionFromPositionError,
} from './geolocation';

describe('mergeGeoPermission', () => {
  it('izin verilmişken Permissions API prompt dalgalanmasını yutmaz', () => {
    expect(mergeGeoPermission('granted', 'prompt', false)).toBe('granted');
    expect(mergeGeoPermission('granted', 'unknown', true)).toBe('granted');
    expect(mergeGeoPermission('prompt', 'prompt', true)).toBe('prompt');
  });

  it('red ve desteklenmiyor durumlarını her zaman uygular', () => {
    expect(mergeGeoPermission('granted', 'denied', true)).toBe('denied');
    expect(mergeGeoPermission('granted', 'unsupported', false)).toBe('unsupported');
  });

  it('yeni granted durumunu kabul eder', () => {
    expect(mergeGeoPermission('prompt', 'granted', false)).toBe('granted');
  });
});

describe('locationPermissionBlocked', () => {
  it('konum varken tam ekran kapıyı açmaz', () => {
    expect(locationPermissionBlocked('prompt', true)).toBe(false);
    expect(locationPermissionBlocked('unknown', true)).toBe(false);
    expect(locationPermissionBlocked('granted', false)).toBe(false);
  });

  it('reddedilmiş veya desteklenmeyen izni bloklar', () => {
    expect(locationPermissionBlocked('denied', true)).toBe(true);
    expect(locationPermissionBlocked('unsupported', false)).toBe(true);
  });

  it('düzeltme yokken jest ister', () => {
    expect(locationPermissionBlocked('prompt', false)).toBe(true);
    expect(locationPermissionBlocked('unknown', false)).toBe(true);
  });
});

describe('geoErrorMessage', () => {
  it('elde konum varken TIMEOUT hatasını göstermez', () => {
    expect(geoErrorMessage('granted', { code: 3 }, true)).toBeNull();
    expect(geoErrorMessage('granted', { code: 2 }, true)).toBeNull();
  });

  it('konum yokken zaman aşımını gösterir', () => {
    expect(geoErrorMessage('granted', { code: 3 }, false)).toMatch(/Konum alınamadı/);
  });
});

describe('permissionFromPositionError', () => {
  it('yalnızca permission denied kodunu denied yapar', () => {
    expect(permissionFromPositionError({ code: 1 }, 'granted')).toBe('denied');
    expect(permissionFromPositionError({ code: 3 }, 'granted')).toBe('granted');
    expect(permissionFromPositionError({ code: 2 }, 'prompt')).toBe('prompt');
  });
});

describe('deviceLocationUnchanged', () => {
  it('GPS titremesini yok sayar', () => {
    expect(
      deviceLocationUnchanged(
        { latitude: 36.8121, longitude: 34.6415, heading: 10 },
        { latitude: 36.81212, longitude: 34.64152, heading: 14 },
      ),
    ).toBe(true);
  });

  it('anlamlı yer değişimini algılar', () => {
    expect(
      deviceLocationUnchanged(
        { latitude: 36.8121, longitude: 34.6415 },
        { latitude: 36.82, longitude: 34.65 },
      ),
    ).toBe(false);
  });
});

describe('sürücü/yolcu flaş senaryosu', () => {
  it('her 5 sn TIMEOUT + prompt dalgalanmasında kapı ve hata görünmez', () => {
    let permission = mergeGeoPermission('granted', 'prompt', true);
    expect(permission).toBe('granted');
    expect(locationPermissionBlocked(permission, true)).toBe(false);
    expect(geoErrorMessage(permission, { code: 3 }, true)).toBeNull();

    permission = mergeGeoPermission(permission, 'unknown', true);
    expect(locationPermissionBlocked(permission, true)).toBe(false);
    expect(geoErrorMessage(permission, { code: 2 }, true)).toBeNull();
  });

  it('hiç düzeltme yokken ilk zaman aşımı hâlâ görünür', () => {
    expect(locationPermissionBlocked('prompt', false)).toBe(true);
    expect(geoErrorMessage('prompt', { code: 3 }, false)).toMatch(/Konum alınamadı/);
  });
});

describe('headingClose / transient error', () => {
  it('360 derecelik heading sarmalını hesaplar', () => {
    expect(headingClose(359, 2)).toBe(true);
    expect(headingClose(10, 90)).toBe(false);
  });

  it('TIMEOUT ve UNAVAILABLE geçici hatadır', () => {
    expect(isTransientGeoError({ code: 3 })).toBe(true);
    expect(isTransientGeoError({ code: 2 })).toBe(true);
    expect(isTransientGeoError({ code: 1 })).toBe(false);
  });
});
