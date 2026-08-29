import type { Coordinate, MapsClientConfig, RouteEstimate } from "@heytaksi/shared";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import { decodeGooglePolyline } from "./google-polyline.js";

const EARTH_RADIUS_METERS = 6_371_000;
/** İki nokta arası büyük daire mesafesi (metre). */
function haversine(a: Coordinate, b: Coordinate): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** Sağlayıcı yokluğunda kullanılan yaklaşık rota: düz hat ± hafif kıvrım, mesafe ×1.35 sapma payı. */
function approximateRoute(pickup: Coordinate, destination: Coordinate): RouteEstimate {
  const direct = haversine(pickup, destination);
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

/**
 * Harita altyapısı.
 *
 * Google Maps API anahtarı varsa Geocoding + Directions kullanılır; yoksa
 * Nominatim / OSRM. Anahtar hatalıysa ve MAP_FALLBACK açıksa OSM'ye düşülür.
 */
export class MapService {
  clientConfig(): MapsClientConfig {
    const browserKey = env.GOOGLE_MAPS_BROWSER_KEY ?? null;
    return {
      provider: browserKey || env.GOOGLE_MAPS_API_KEY ? "google" : "osm",
      browserKey,
      mapId: env.GOOGLE_MAPS_MAP_ID ?? null,
    };
  }

  async search(query: string, near?: { latitude: number; longitude: number }) {
    if (googleKey()) {
      try {
        return await this.googleSearch(query, near);
      } catch (error) {
        if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      }
    }
    return this.nominatimSearch(query, near);
  }

  async reverse(latitude: number, longitude: number) {
    if (googleKey()) {
      try {
        return await this.googleReverse(latitude, longitude);
      } catch (error) {
        if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      }
    }
    return this.nominatimReverse(latitude, longitude);
  }

  async route(pickup: Coordinate, destination: Coordinate): Promise<RouteEstimate> {
    if (googleKey()) {
      try {
        return await this.googleRoute(pickup, destination);
      } catch (error) {
        if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      }
    }
    return this.osrmRoute(pickup, destination);
  }

  /* ------------------------------ Google -------------------------------- */

  private async googleSearch(query: string, near?: { latitude: number; longitude: number }) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("language", "tr");
    url.searchParams.set("region", "tr");
    url.searchParams.set("components", "country:TR");
    url.searchParams.set("key", googleKey()!);
    if (near) {
      url.searchParams.set("bounds", `${near.latitude - 0.4},${near.longitude - 0.4}|${near.latitude + 0.4},${near.longitude + 0.4}`);
    }
    const payload = await this.googleJson<{
      status: string;
      results?: Array<{
        place_id: string;
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
        types?: string[];
      }>;
    }>(url);
    this.assertGoogleOk(payload.status, "GEOCODING_UNAVAILABLE", "Adres arama servisine ulaşılamadı.");
    return (payload.results ?? []).slice(0, 6).map((item) => ({
      id: item.place_id,
      address: item.formatted_address,
      latitude: item.geometry.location.lat,
      longitude: item.geometry.location.lng,
      type: item.types?.[0] ?? "geocode",
    }));
  }

  private async googleReverse(latitude: number, longitude: number) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${latitude},${longitude}`);
    url.searchParams.set("language", "tr");
    url.searchParams.set("key", googleKey()!);
    const payload = await this.googleJson<{
      status: string;
      results?: Array<{ formatted_address?: string }>;
    }>(url);
    if (payload.status === "ZERO_RESULTS") {
      return { latitude, longitude, address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` };
    }
    this.assertGoogleOk(payload.status, "GEOCODING_UNAVAILABLE", "Konum adresi bulunamadı.");
    return {
      latitude,
      longitude,
      address: payload.results?.[0]?.formatted_address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    };
  }

  private async googleRoute(pickup: Coordinate, destination: Coordinate): Promise<RouteEstimate> {
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${pickup.latitude},${pickup.longitude}`);
    url.searchParams.set("destination", `${destination.latitude},${destination.longitude}`);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("language", "tr");
    url.searchParams.set("region", "tr");
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
    const url = new URL("/search", env.GEOCODING_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "6");
    url.searchParams.set("countrycodes", "tr");
    if (near)
      url.searchParams.set(
        "viewbox",
        `${near.longitude - 0.5},${near.latitude + 0.5},${near.longitude + 0.5},${near.latitude - 0.5}`,
      );
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": env.MAP_SERVICE_USER_AGENT,
          "accept-language": "tr",
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok)
        throw new AppError(502, "GEOCODING_UNAVAILABLE", "Adres arama servisine ulaşılamadı.");
      const results = (await response.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
        type: string;
      }>;
      return results.map((item) => ({
        id: String(item.place_id),
        address: item.display_name,
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        type: item.type,
      }));
    } catch (error) {
      if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      const seed = [...query].reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const center = near ?? { latitude: 36.8121, longitude: 34.6415 };
      return [
        {
          id: `fallback-${seed}`,
          address: query,
          latitude: center.latitude + ((seed % 60) - 30) / 500,
          longitude: center.longitude + ((seed % 47) - 23) / 500,
          type: "approximate",
        },
      ];
    }
  }

  private async nominatimReverse(latitude: number, longitude: number) {
    const url = new URL("/reverse", env.GEOCODING_URL);
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": env.MAP_SERVICE_USER_AGENT,
          "accept-language": "tr",
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok)
        throw new AppError(502, "GEOCODING_UNAVAILABLE", "Konum adresi bulunamadı.");
      const item = (await response.json()) as { display_name?: string };
      return {
        latitude,
        longitude,
        address: item.display_name ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      };
    } catch (error) {
      if (!env.MAP_FALLBACK || error instanceof AppError) throw error;
      return {
        latitude,
        longitude,
        address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
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
