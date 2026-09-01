import { coordinatesClose } from './geolocation';

/** Yolcu alış noktası GPS’ten geldiğinde kullanılan etiket. */
export const LIVE_PICKUP_ADDRESS = 'Mevcut konum';

export type MapPinMode = 'pickup' | 'destination';

export function isLivePickup(
  point: { latitude: number; longitude: number; address?: string } | null | undefined,
): point is { latitude: number; longitude: number; address: string } {
  return Boolean(point && point.address === LIVE_PICKUP_ADDRESS);
}

/**
 * Harita dokunuşu: alış yoksa (veya alış seçim modundaysa) alış,
 * aksi halde varış. Boş moda düşülmez; tıklama yutulmaz.
 */
export function mapClickTarget(pinMode: MapPinMode, hasPickup: boolean): MapPinMode {
  if (!hasPickup || pinMode === 'pickup') return 'pickup';
  return 'destination';
}

/** GPS alışa yazıldıktan sonra harita dokunuşu varışı seçsin. */
export function pinModeAfterAdoptingPickup(): MapPinMode {
  return 'destination';
}

/**
 * Cihaz konumunu alış noktası yap.
 * `force`: çapraz tuş — kullanıcının seçtiği pini GPS ile değiştir.
 * Aksi halde yalnızca boş alış veya hâlâ “Mevcut konum” etiketi güncellenir.
 */
export function shouldAdoptDevicePickup(
  current: { latitude: number; longitude: number; address: string } | null,
  device: { latitude: number; longitude: number } | null,
  force: boolean,
): boolean {
  if (!device) return false;
  if (force || !current) return true;
  if (!isLivePickup(current)) return false;
  return !coordinatesClose(current, device, 0.0004);
}
