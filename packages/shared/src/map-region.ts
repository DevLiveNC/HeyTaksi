/** Lefkoşa (Kuzey Kıbrıs Türk Cumhuriyeti) — varsayılan harita ve filo merkezi. */
export const DEFAULT_MAP_CENTER = { latitude: 35.1856, longitude: 33.3823 };

export const KKTC_SERVICE_AREA_CODE = 'SERVICE_AREA';
export const KKTC_SERVICE_AREA_MESSAGE = 'Hey Taksi yalnızca KKTC içinde hizmet verir.';
export const KKTC_OUTSIDE_LOCATION_MESSAGE =
  'Konumun hizmet bölgesi dışında. Haritadan alış noktası seç.';

/**
 * KKTC yaklaşık görünüm kutusu. Nominatim `viewbox` sırası:
 * minLon, maxLat, maxLon, minLat. Arama `bounded=1` ile bu kutuya kilitlenir;
 * sonuçlar ayrıca {@link isInKktcServiceArea} poligonuyla süzülür.
 */
export const KKTC_VIEWBOX = {
  minLongitude: 32.26,
  maxLatitude: 35.72,
  maxLongitude: 34.65,
  minLatitude: 34.96,
} as const;

/** Harita kamerası: viewbox + küçük pay (Karpaz / Lefke kenarları kesilmesin). */
export const KKTC_MAP_MAX_BOUNDS = {
  minLongitude: 32.2,
  minLatitude: 34.92,
  maxLongitude: 34.72,
  maxLatitude: 35.78,
} as const;

export const KKTC_MAP_MIN_ZOOM = 8;

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

export function kktcMapMaxBoundsLngLat(): [[number, number], [number, number]] {
  const box = KKTC_MAP_MAX_BOUNDS;
  return [
    [box.minLongitude, box.minLatitude],
    [box.maxLongitude, box.maxLatitude],
  ];
}

export function kktcGoogleLatLngBounds(): {
  south: number;
  west: number;
  north: number;
  east: number;
} {
  const box = KKTC_MAP_MAX_BOUNDS;
  return {
    south: box.minLatitude,
    west: box.minLongitude,
    north: box.maxLatitude,
    east: box.maxLongitude,
  };
}

/**
 * KKTC hizmet poligonu [lon, lat]: kuzey sahil + Karpaz + Yeşil Hat.
 * Güney Kıbrıs (Larnaka, Güney Lefkoşa) ve Anadolu dışarıda kalır.
 */
export const KKTC_SERVICE_POLYGON: ReadonlyArray<readonly [number, number]> = [
  [32.8, 35.16],
  [32.92, 35.41],
  [33.32, 35.36],
  [33.58, 35.37],
  [34.4, 35.6],
  [34.59, 35.7],
  [34.42, 35.54],
  [34.15, 35.45],
  [33.92, 35.29],
  [33.96, 35.1],
  [33.7, 35.07],
  [33.47, 35.0],
  [33.5, 35.12],
  [33.4, 35.16],
  [33.36, 35.168],
  [33.29, 35.155],
  [32.99, 35.12],
  [32.84, 35.09],
  [32.8, 35.16],
];

/** Nokta-çokgen (ray casting). Köşeler [longitude, latitude]. */
export function isInKktcServiceArea(latitude: number, longitude: number): boolean {
  const polygon = KKTC_SERVICE_POLYGON;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]![0];
    const yi = polygon[i]![1];
    const xj = polygon[j]![0];
    const yj = polygon[j]![1];
    const intersect =
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface KktcPlace {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: 'city' | 'landmark';
  aliases: string[];
}

export const KKTC_PLACES: readonly KktcPlace[] = [
  {
    id: 'lefkosa',
    name: 'Lefkoşa',
    address: 'Lefkoşa, KKTC',
    latitude: 35.1856,
    longitude: 33.3823,
    type: 'city',
    aliases: ['nicosia', 'lefkosia', 'north nicosia'],
  },
  {
    id: 'girne',
    name: 'Girne',
    address: 'Girne, KKTC',
    latitude: 35.3417,
    longitude: 33.3192,
    type: 'city',
    aliases: ['kyrenia'],
  },
  {
    id: 'gazimagusa',
    name: 'Gazimağusa',
    address: 'Gazimağusa, KKTC',
    latitude: 35.1264,
    longitude: 33.9375,
    type: 'city',
    aliases: ['famagusta', 'magusa', 'mağusa', 'ammochostos'],
  },
  {
    id: 'guzelyurt',
    name: 'Güzelyurt',
    address: 'Güzelyurt, KKTC',
    latitude: 35.1983,
    longitude: 32.9939,
    type: 'city',
    aliases: ['morphou'],
  },
  {
    id: 'iskele',
    name: 'İskele',
    address: 'İskele, KKTC',
    latitude: 35.2878,
    longitude: 33.8917,
    type: 'city',
    aliases: ['trikomo'],
  },
  {
    id: 'lefke',
    name: 'Lefke',
    address: 'Lefke, KKTC',
    latitude: 35.1119,
    longitude: 32.8503,
    type: 'city',
    aliases: ['lefka'],
  },
  {
    id: 'gonyeli',
    name: 'Gönyeli',
    address: 'Gönyeli, Lefkoşa, KKTC',
    latitude: 35.2131,
    longitude: 33.3056,
    type: 'city',
    aliases: ['kioneli'],
  },
  {
    id: 'ercan',
    name: 'Ercan Havalimanı',
    address: 'Ercan Havalimanı, Lefkoşa, KKTC',
    latitude: 35.1547,
    longitude: 33.4961,
    type: 'landmark',
    aliases: ['ecn', 'ercan airport', 'tymbou'],
  },
  {
    id: 'girne-limani',
    name: 'Girne Limanı',
    address: 'Girne Limanı, Girne, KKTC',
    latitude: 35.3414,
    longitude: 33.3217,
    type: 'landmark',
    aliases: ['kyrenia harbour', 'girne harbor', 'marina'],
  },
  {
    id: 'bellapais',
    name: 'Bellapais Manastırı',
    address: 'Bellapais Manastırı, Girne, KKTC',
    latitude: 35.3067,
    longitude: 33.3544,
    type: 'landmark',
    aliases: ['bellapais abbey', 'beylerbeyi'],
  },
  {
    id: 'salamis',
    name: 'Salamis Harabeleri',
    address: 'Salamis Harabeleri, Gazimağusa, KKTC',
    latitude: 35.185,
    longitude: 33.9025,
    type: 'landmark',
    aliases: ['salamis ruins'],
  },
  {
    id: 'ydu',
    name: 'Yakın Doğu Üniversitesi',
    address: 'Yakın Doğu Üniversitesi, Lefkoşa, KKTC',
    latitude: 35.2264,
    longitude: 33.3222,
    type: 'landmark',
    aliases: ['neu', 'ydu', 'near east university'],
  },
  {
    id: 'lefkosa-hastane',
    name: 'Lefkoşa Devlet Hastanesi',
    address: 'Dr. Burhan Nalbantoğlu Devlet Hastanesi, Lefkoşa, KKTC',
    latitude: 35.204,
    longitude: 33.348,
    type: 'landmark',
    aliases: ['burhan nalbantoğlu', 'devlet hastanesi'],
  },
  {
    id: 'dereboyu',
    name: 'Dereboyu',
    address: 'Dereboyu, Mehmet Akif Caddesi, Lefkoşa, KKTC',
    latitude: 35.1945,
    longitude: 33.3512,
    type: 'landmark',
    aliases: ['mehmet akif', 'dereboyu cad'],
  },
  {
    id: 'bandabuliya',
    name: 'Bandabuliya',
    address: 'Bandabuliya, Suriçi, Lefkoşa, KKTC',
    latitude: 35.1764,
    longitude: 33.3642,
    type: 'landmark',
    aliases: ['belediye pazarı', 'arasta'],
  },
  {
    id: 'kaymakli',
    name: 'Kaymaklı',
    address: 'Kaymaklı, Lefkoşa, KKTC',
    latitude: 35.198,
    longitude: 33.378,
    type: 'landmark',
    aliases: ['kaimakli'],
  },
  {
    id: 'gazimagusa-surici',
    name: 'Gazimağusa Suriçi',
    address: 'Suriçi, Gazimağusa, KKTC',
    latitude: 35.125,
    longitude: 33.941,
    type: 'landmark',
    aliases: ['famagusta walled city', 'namık kemal meydanı'],
  },
];

export function kktcPlaceById(id: string): KktcPlace | undefined {
  return KKTC_PLACES.find((place) => place.id === id);
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9ğüşöç\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchKktcPlaces(query: string, limit = 8): KktcPlace[] {
  const needle = normalizeSearch(query);
  if (!needle) return KKTC_PLACES.filter((place) => place.type === 'landmark').slice(0, limit);
  const ranked = KKTC_PLACES.map((place) => {
    const hay = normalizeSearch(`${place.name} ${place.address} ${place.aliases.join(' ')}`);
    const name = normalizeSearch(place.name);
    let score = 0;
    if (name === needle || hay === needle) score = 4;
    else if (name.startsWith(needle)) score = 3;
    else if (hay.startsWith(needle) || hay.includes(` ${needle}`)) score = 2;
    else if (hay.includes(needle)) score = 1;
    return { place, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name, 'tr'));
  return ranked.slice(0, limit).map((item) => item.place);
}

const CITY_NAME_TR: Record<string, string> = {
  nicosia: 'Lefkoşa',
  'north nicosia': 'Lefkoşa',
  lefkosia: 'Lefkoşa',
  lefkosa: 'Lefkoşa',
  kyrenia: 'Girne',
  girne: 'Girne',
  famagusta: 'Gazimağusa',
  ammochostos: 'Gazimağusa',
  gazimagusa: 'Gazimağusa',
  magusa: 'Gazimağusa',
  morphou: 'Güzelyurt',
  guzelyurt: 'Güzelyurt',
  trikomo: 'İskele',
  iskele: 'İskele',
  lefka: 'Lefke',
  lefke: 'Lefke',
};

function turkishCityName(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const key = normalizeSearch(value);
  return CITY_NAME_TR[key] ?? value.trim();
}

function firstPresent(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export interface KktcAddressInput {
  name?: string | null | undefined;
  displayName?: string | null | undefined;
  namedetails?: Record<string, string | undefined> | null | undefined;
  address?: Record<string, string | undefined> | null | undefined;
}

function stripCyprusLabel(value: string): string {
  return value
    .replace(/\bRepublic of Cyprus\b/gi, '')
    .replace(/\bKıbrıs Cumhuriyeti\b/gi, '')
    .replace(/\bCyprus\b/gi, '')
    .replace(/\bKıbrıs\b/gi, '')
    .replace(/\s*,\s*,/g, ',')
    .replace(/^,\s*|,\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Nominatim / Google adresini Türkçe KKTC biçimine indirger. */
export function formatKktcAddress(input: KktcAddressInput): string {
  const details = input.namedetails ?? {};
  const addr = input.address ?? {};
  const primary = firstPresent(
    details['name:tr'],
    input.name,
    details.name,
    addr.amenity,
    addr.shop,
    addr.tourism,
    addr.historic,
    addr.road,
    addr.pedestrian,
  );
  const locality = firstPresent(addr.neighbourhood, addr.suburb, addr.city_district, addr.quarter, addr.hamlet);
  const city = turkishCityName(
    firstPresent(addr.city, addr.town, addr.village, addr.municipality, addr.county, addr.state),
  );
  const parts: string[] = [];
  for (const part of [primary, locality, city]) {
    if (!part) continue;
    const cleaned = stripCyprusLabel(part);
    if (!cleaned) continue;
    if (parts.some((existing) => existing.toLocaleLowerCase('tr') === cleaned.toLocaleLowerCase('tr'))) continue;
    parts.push(cleaned);
  }
  if (parts.length) {
    if (!parts.some((part) => /kktc/i.test(part))) parts.push('KKTC');
    return parts.join(', ');
  }
  const fallback = stripCyprusLabel(input.displayName ?? '');
  if (fallback) return fallback.endsWith('KKTC') ? fallback : `${fallback}, KKTC`;
  return 'KKTC';
}

export function kktcPlaceToSearchHit(place: KktcPlace): {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  type: string;
} {
  return {
    id: `kktc-${place.id}`,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    type: place.type,
  };
}

/** OpenFreeMap Liberty: küresel OSM vektör, POI (kafe, market, durak) katmanları. */
export const OSM_LIGHT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Aynı Liberty stili; POI'ler koyu temada da görünsün diye dark yerine liberty. */
export const OSM_DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_LABEL_LANGUAGE = 'tr';
