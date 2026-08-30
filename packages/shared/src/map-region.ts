/** Lefkoşa (Kuzey Kıbrıs Türk Cumhuriyeti) — varsayılan harita ve filo merkezi. */
export const DEFAULT_MAP_CENTER = { latitude: 35.1856, longitude: 33.3823 };

/**
 * KKTC yaklaşık görünüm kutusu. Nominatim `viewbox` sırası:
 * minLon, maxLat, maxLon, minLat. `bounded` verilmez; arama küresel kalır,
 * sonuçlar bu bölgeye ağırlıklanır.
 */
export const KKTC_VIEWBOX = {
  minLongitude: 32.26,
  maxLatitude: 35.72,
  maxLongitude: 34.65,
  minLatitude: 34.96,
} as const;

export function kktcViewboxParam(): string {
  const box = KKTC_VIEWBOX;
  return `${box.minLongitude},${box.maxLatitude},${box.maxLongitude},${box.minLatitude}`;
}

export function nearbyViewboxParam(
  near: { latitude: number; longitude: number },
  span = 0.5,
): string {
  return `${near.longitude - span},${near.latitude + span},${near.longitude + span},${near.latitude - span}`;
}

/** OpenFreeMap Liberty: küresel OSM vektör, POI (kafe, market, durak) katmanları. */
export const OSM_LIGHT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Aynı Liberty stili; POI'ler koyu temada da görünsün diye dark yerine liberty. */
export const OSM_DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_LABEL_LANGUAGE = 'tr';
