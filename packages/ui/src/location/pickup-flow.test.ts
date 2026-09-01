import { describe, expect, it } from 'vitest';
import {
  LIVE_PICKUP_ADDRESS,
  isLivePickup,
  mapClickTarget,
  pinModeAfterAdoptingPickup,
  shouldAdoptDevicePickup,
} from './pickup-flow';
import { locatingPickupLabel } from './geolocation';

const lefkosa = { latitude: 35.1856, longitude: 33.3823, address: LIVE_PICKUP_ADDRESS };
const girne = { latitude: 35.3417, longitude: 33.3192, address: 'Girne Limanı, Girne, KKTC' };

describe('mapClickTarget', () => {
  it('alış yokken harita dokunuşu alış seçer', () => {
    expect(mapClickTarget('destination', false)).toBe('pickup');
    expect(mapClickTarget('pickup', false)).toBe('pickup');
  });

  it('alış varken varsayılan varıştır; alış modu pini değiştirir', () => {
    expect(mapClickTarget('destination', true)).toBe('destination');
    expect(mapClickTarget('pickup', true)).toBe('pickup');
  });
});

describe('shouldAdoptDevicePickup', () => {
  it('boş alışa GPS yazar', () => {
    expect(shouldAdoptDevicePickup(null, lefkosa, false)).toBe(true);
  });

  it('kullanıcının seçtiği pini GPS titremesiyle ezmez', () => {
    expect(shouldAdoptDevicePickup(girne, lefkosa, false)).toBe(false);
  });

  it('çapraz tuş manuel pini mevcut konumla değiştirir', () => {
    expect(shouldAdoptDevicePickup(girne, lefkosa, true)).toBe(true);
  });

  it('canlı alış yalnızca anlamlı yer değişiminde güncellenir', () => {
    expect(
      shouldAdoptDevicePickup(lefkosa, { latitude: 35.18562, longitude: 33.38232 }, false),
    ).toBe(false);
    expect(
      shouldAdoptDevicePickup(lefkosa, { latitude: 35.2, longitude: 33.4 }, false),
    ).toBe(true);
  });
});

describe('isLivePickup / pinModeAfterAdoptingPickup', () => {
  it('Mevcut konum etiketini tanır', () => {
    expect(isLivePickup(lefkosa)).toBe(true);
    expect(isLivePickup(girne)).toBe(false);
    expect(LIVE_PICKUP_ADDRESS).toBe(
      locatingPickupLabel({ address: null, blocked: false, loading: false, hasFix: true }),
    );
  });

  it('GPS yazıldıktan sonra varış seçimine geçer', () => {
    expect(pinModeAfterAdoptingPickup()).toBe('destination');
  });
});
