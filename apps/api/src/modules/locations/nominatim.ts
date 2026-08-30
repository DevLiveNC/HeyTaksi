import { DEFAULT_MAP_CENTER, kktcViewboxParam, nearbyViewboxParam } from '@heytaksi/shared';

export { DEFAULT_MAP_CENTER };

/** Küresel Nominatim araması; konum yoksa KKTC'ye ağırlık verir, ülke kodu kısıtı yoktur. */
export function buildNominatimSearchUrl(
  baseUrl: string,
  query: string,
  near?: { latitude: number; longitude: number },
): URL {
  const url = new URL('/search', baseUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('extratags', '1');
  url.searchParams.set('namedetails', '1');
  url.searchParams.set('limit', '8');
  url.searchParams.set('viewbox', near ? nearbyViewboxParam(near) : kktcViewboxParam());
  return url;
}

export function buildNominatimReverseUrl(baseUrl: string, latitude: number, longitude: number): URL {
  const url = new URL('/reverse', baseUrl);
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('namedetails', '1');
  url.searchParams.set('zoom', '18');
  return url;
}

export const NOMINATIM_HEADERS = {
  'accept-language': 'tr',
} as const;
