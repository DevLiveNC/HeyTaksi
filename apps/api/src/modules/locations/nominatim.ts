import { DEFAULT_MAP_CENTER, formatKktcAddress, kktcViewboxParam } from '@heytaksi/shared';

export { DEFAULT_MAP_CENTER };

/** KKTC kutusuna kilitli Nominatim araması; `near` yalnızca çağıran tarafta sıralama içindir. */
export function buildNominatimSearchUrl(baseUrl: string, query: string): URL {
  const url = new URL('/search', baseUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('extratags', '1');
  url.searchParams.set('namedetails', '1');
  url.searchParams.set('limit', '8');
  url.searchParams.set('viewbox', kktcViewboxParam());
  url.searchParams.set('bounded', '1');
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

export interface NominatimPlace {
  place_id?: number;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  namedetails?: Record<string, string | undefined>;
  address?: Record<string, string | undefined>;
}

export function nominatimPlaceAddress(item: NominatimPlace): string {
  return formatKktcAddress({
    name: item.name,
    displayName: item.display_name,
    namedetails: item.namedetails,
    address: item.address,
  });
}
