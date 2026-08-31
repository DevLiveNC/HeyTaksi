import type { Coordinate, MapsClientConfig, RouteEstimate } from "@heytaksi/shared";
import {
  DEFAULT_MAP_CENTER,
  KKTC_MAP_MAX_BOUNDS,
  KKTC_MAP_MIN_ZOOM,
  KKTC_SERVICE_AREA_CODE,
  KKTC_SERVICE_AREA_MESSAGE,
  MAP_LABEL_LANGUAGE,
  OSM_LIGHT_STYLE_URL,
  formatKktcAddress,
  haversineMeters,
  isInKktcServiceArea,
  kktcPlaceToSearchHit,
  matchKktcPlaces,
} from "@heytaksi/shared";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import { decodeGooglePolyline } from "./google-polyline.js";
import {
  NOMINATIM_HEADERS,
  buildNominatimReverseUrl,
  buildNominatimSearchUrl,
  nominatimPlaceAddress,
  type NominatimPlace,
} from "./nominatim.js";

export interface LocationSearchHit {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  type: string;
}

function serviceAreaError(): AppError {
  return new AppError(422, KKTC_SERVICE_AREA_CODE, KKTC_SERVICE_AREA_MESSAGE);
}

function assertServiceArea(point: { latitude: number; longitude: number }) {
  if (!isInKktcServiceArea(point.latitude, point.longitude)) throw serviceAreaError();
}

function catalogHits(query: string, limit = 8): LocationSearchHit[] {
  return matchKktcPlaces(query, limit).map(kktcPlaceToSearchHit);
}

function mergeSearchHits(
  catalog: LocationSearchHit[],
  remote: LocationSearchHit[],
  near?: { latitude: number; longitude: number },
): LocationSearchHit[] {
  const seen = new Set<string>();
  const keyOf = (item: LocationSearchHit) =>
    `${item.latitude.toFixed(4)},${item.longitude.toFixed(4)}`;
  const merged: LocationSearchHit[] = [];
  for (const item of [...catalog, ...remote]) {
    if (!isInKktcServiceArea(item.latitude, item.longitude)) continue;
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  if (!near || !isInKktcServiceArea(near.latitude, near.longitude)) return merged.slice(0, 8);
  return merged
    .sort((a, b) => haversineMeters(a, near) - haversineMeters(b, near))
    .slice(0, 8);
}

/** Sağlayıcı yokluğunda kullanılan yaklaşık rota: düz hat ± hafif kıvrım, mesafe ×1.35 sapma payı. */
function approximateRoute(pickup: Coordinate, destination: Coordinate): RouteEstimate {
  const direct = haversineMeters(pickup, destination);
  const distanceMeters = Math.round(direct * 1.35);
  const durationSeconds = Math.max(120, Math.round((distanceMeters / 1000 / 28) * 3600));
  const steps = 32;
  const coordinates: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const latitude = pickup.latitude + (destination.latitude - pickup.latitude) * ratio;
    const longitude = pickup.longitude + (destination.longitude - pickup.longitude) * ratio;
    const bend = Math.sin(ratio * Math.PI) * 0.0025;
    coordinates.push([longitude + bend, latitude + bend * 0.6]);
  }
  return { distanceMeters, durationSeconds, geometry: { type: "LineString", coordinates } };
}

function googleKey(): string | undefined {
  return env.GOOGLE_MAPS_API_KEY;
}

function kktcGoogleBoundsParam(): string {
  const box = KKTC_MAP_MAX_BOUNDS;
  return `${box.minLatitude},${box.minLongitude}|${box.maxLatitude},${box.maxLongitude}`;
}

/**
 * Harita altyapısı.
 *
 * Şimdilik OSM (Nominatim + OSRM) birincil sağlayıcıdır. Google Maps API
 * anahtarı ve MAP_PROVIDER=google varsa Geocoding + Directions kullanılır;
 * anahtar hatalıysa ve MAP_FALLBACK açıksa OSM'ye düşülür.
 * Arama, rota ve ters geocode KKTC hizmet alanına kilitlenir.
 */
export class MapService {
  clientConfig(): MapsClientConfig {
    const browserKey = env.GOOGLE_MAPS_BROWSER_KEY ?? null;
    const googleReady = Boolean(browserKey || env.GOOGLE_MAPS_API_KEY);
    return {
      provider: env.MAP_PROVIDER === "google" && googleReady ? "google" : "osm",
      browserKey: env.MAP_PROVIDER === "google" ? browserKey : null,
      mapId: env.MAP_PROVIDER === "google" ? (env.GOOGLE_MAPS_MAP_ID ?? null) : null,
      styleUrl: OSM_LIGHT_STYLE_URL,
      labelLanguage: MAP_LABEL_LANGUAGE,
      defaultCenter: DEFAULT_MAP_CENTER,
      bounds: KKTC_MAP_MAX_BOUNDS,
      minZoom: KKTC_MAP_MIN_ZOOM,
    };
  }

  async search(query: string, near?: { latitude: number; longitude: number }) {
    const catalog = catalogHits(query);
    if (env.MAP_PROVIDER === "google" && googleKey()) {
      try {
        return mergeSearchHits(catalog, await this.googleSearch(query, near), near);
      } catch (error) {
        if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      }
    }
    return mergeSearchHits(catalog, await this.nominatimSearch(query, near), near);
  }

  async reverse(latitude: number, longitude: number) {
    assertServiceArea({ latitude, longitude });
    if (env.MAP_PROVIDER === "google" && googleKey()) {
      try {
        return await this.googleReverse(latitude, longitude);
      } catch (error) {
        if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      }
    }
    return this.nominatimReverse(latitude, longitude);
  }

  async route(pickup: Coordinate, destination: Coordinate): Promise<RouteEstimate> {
    assertServiceArea(pickup);
    assertServiceArea(destination);
    if (env.MAP_PROVIDER === "google" && googleKey()) {
      try {
        return await this.googleRoute(pickup, destination);
      } catch (error) {
        if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      }
    }
    return this.osrmRoute(pickup, destination);
  }

  /* ------------------------------ Google -------------------------------- */

  private async googleSearch(query: string, _near?: { latitude: number; longitude: number }) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("language", "tr");
    url.searchParams.set("key", googleKey()!);
    url.searchParams.set("bounds", kktcGoogleBoundsParam());
    const payload = await this.googleJson<{
      status: string;
      results?: Array<{
        place_id: string;
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
        types?: string[];
        address_components?: Array<{ long_name: string; types: string[] }>;
      }>;
    }>(url);
    this.assertGoogleOk(payload.status, "GEOCODING_UNAVAILABLE", "Adres arama servisine ulaşılamadı.");
    return (payload.results ?? []).slice(0, 6).map((item) => {
      const component = (type: string) =>
        item.address_components?.find((entry) => entry.types.includes(type))?.long_name;
      return {
        id: item.place_id,
        address: formatKktcAddress({
          displayName: item.formatted_address,
          address: {
            city: component("locality") ?? component("administrative_area_level_2"),
            town: component("administrative_area_level_2"),
            suburb: component("sublocality") ?? component("sublocality_level_1"),
            road: component("route"),
            country: component("country"),
          },
        }),
        latitude: item.geometry.location.lat,
        longitude: item.geometry.location.lng,
        type: item.types?.[0] ?? "geocode",
      };
    });
  }

  private async googleReverse(latitude: number, longitude: number) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${latitude},${longitude}`);
    url.searchParams.set("language", "tr");
    url.searchParams.set("key", googleKey()!);
    const payload = await this.googleJson<{
      status: string;
      results?: Array<{
        formatted_address?: string;
        address_components?: Array<{ long_name: string; types: string[] }>;
      }>;
    }>(url);
    if (payload.status === "ZERO_RESULTS") {
      return { latitude, longitude, address: formatKktcAddress({ displayName: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` }) };
    }
    this.assertGoogleOk(payload.status, "GEOCODING_UNAVAILABLE", "Konum adresi bulunamadı.");
    const result = payload.results?.[0];
    const component = (type: string) =>
      result?.address_components?.find((entry) => entry.types.includes(type))?.long_name;
    return {
      latitude,
      longitude,
      address: formatKktcAddress({
        displayName: result?.formatted_address,
        address: {
          city: component("locality") ?? component("administrative_area_level_2"),
          suburb: component("sublocality") ?? component("sublocality_level_1"),
          road: component("route"),
          country: component("country"),
        },
      }),
    };
  }

  private async googleRoute(pickup: Coordinate, destination: Coordinate): Promise<RouteEstimate> {
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${pickup.latitude},${pickup.longitude}`);
    url.searchParams.set("destination", `${destination.latitude},${destination.longitude}`);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("language", "tr");
    url.searchParams.set("key", googleKey()!);
    const payload = await this.googleJson<{
      status: string;
      routes?: Array<{
        overview_polyline?: { points?: string };
        legs?: Array<{ distance?: { value?: number }; duration?: { value?: number } }>;
      }>;
    }>(url);
    if (payload.status === "ZERO_RESULTS") {
      throw new AppError(422, "ROUTE_NOT_FOUND", "Bu noktalar arasında araç rotası bulunamadı.");
    }
    this.assertGoogleOk(payload.status, "ROUTING_UNAVAILABLE", "Rota servisine ulaşılamadı.");
    const route = payload.routes?.[0];
    const leg = route?.legs?.[0];
    const encoded = route?.overview_polyline?.points;
    if (!route || !leg || !encoded) {
      throw new AppError(422, "ROUTE_NOT_FOUND", "Bu noktalar arasında araç rotası bulunamadı.");
    }
    return {
      distanceMeters: Math.round(leg.distance?.value ?? 0),
      durationSeconds: Math.round(leg.duration?.value ?? 0),
      geometry: { type: "LineString", coordinates: decodeGooglePolyline(encoded) },
    };
  }

  private async googleJson<T>(url: URL): Promise<T> {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new Error(`Google Maps HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private assertGoogleOk(status: string, code: "GEOCODING_UNAVAILABLE" | "ROUTING_UNAVAILABLE", message: string) {
    if (status === "OK") return;
    if (status === "ZERO_RESULTS") return;
    throw new Error(`Google Maps ${code} (${status}): ${message}`);
  }

  /* ------------------------------- OSM ---------------------------------- */

  private async nominatimSearch(query: string, near?: { latitude: number; longitude: number }) {
    const url = buildNominatimSearchUrl(env.GEOCODING_URL, query);
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": env.MAP_SERVICE_USER_AGENT,
          ...NOMINATIM_HEADERS,
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok)
        throw new AppError(502, "GEOCODING_UNAVAILABLE", "Adres arama servisine ulaşılamadı.");
      const results = (await response.json()) as NominatimPlace[];
      return results.flatMap((item) => {
        const latitude = Number(item.lat);
        const longitude = Number(item.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
        return [
          {
            id: String(item.place_id ?? `${latitude},${longitude}`),
            address: nominatimPlaceAddress(item),
            latitude,
            longitude,
            type: item.type ?? "geocode",
          },
        ];
      });
    } catch (error) {
      if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      const nearby = catalogHits(query);
      if (nearby.length) return nearby;
      const center = near && isInKktcServiceArea(near.latitude, near.longitude) ? near : DEFAULT_MAP_CENTER;
      return catalogHits(center === DEFAULT_MAP_CENTER ? "lefkosa" : "").map((item, index) =>
        index === 0
          ? { ...item, latitude: center.latitude, longitude: center.longitude, address: query }
          : item,
      );
    }
  }

  private async nominatimReverse(latitude: number, longitude: number) {
    const url = buildNominatimReverseUrl(env.GEOCODING_URL, latitude, longitude);
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": env.MAP_SERVICE_USER_AGENT,
          ...NOMINATIM_HEADERS,
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok)
        throw new AppError(502, "GEOCODING_UNAVAILABLE", "Konum adresi bulunamadı.");
      const item = (await response.json()) as NominatimPlace;
      return {
        latitude,
        longitude,
        address: nominatimPlaceAddress(item),
      };
    } catch (error) {
      if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      return {
        latitude,
        longitude,
        address: formatKktcAddress({ displayName: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` }),
      };
    }
  }

  private async osrmRoute(pickup: Coordinate, destination: Coordinate): Promise<RouteEstimate> {
    const path = `/route/v1/driving/${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}`;
    const url = new URL(path, env.ROUTING_URL);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    try {
      const response = await fetch(url, {
        headers: { "user-agent": env.MAP_SERVICE_USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new AppError(502, "ROUTING_UNAVAILABLE", "Rota servisine ulaşılamadı.");
      const payload = (await response.json()) as {
        routes?: Array<{
          distance: number;
          duration: number;
          geometry: RouteEstimate["geometry"];
        }>;
      };
      const route = payload.routes?.[0];
      if (!route)
        throw new AppError(422, "ROUTE_NOT_FOUND", "Bu noktalar arasında araç rotası bulunamadı.");
      return {
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
        geometry: route.geometry,
      };
    } catch (error) {
      if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      return approximateRoute(pickup, destination);
    }
  }
}
