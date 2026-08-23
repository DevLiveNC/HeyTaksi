import type { Coordinate, RouteEstimate } from "@heytaksi/shared";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";

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

export class MapService {
  async search(query: string, near?: { latitude: number; longitude: number }) {
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
        throw new AppError(
          502,
          "GEOCODING_UNAVAILABLE",
          "Adres arama servisine ulaşılamadı.",
        );
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
      // Geliştirme düşürme modu: sorgu metnini merkez etrafında deterministik bir noktaya çevir.
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

  async reverse(latitude: number, longitude: number) {
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
        throw new AppError(
          502,
          "GEOCODING_UNAVAILABLE",
          "Konum adresi bulunamadı.",
        );
      const item = (await response.json()) as { display_name?: string };
      return {
        latitude,
        longitude,
        address:
          item.display_name ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
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

  async route(
    pickup: Coordinate,
    destination: Coordinate,
  ): Promise<RouteEstimate> {
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
        throw new AppError(
          502,
          "ROUTING_UNAVAILABLE",
          "Rota servisine ulaşılamadı.",
        );
      const payload = (await response.json()) as {
        routes?: Array<{
          distance: number;
          duration: number;
          geometry: RouteEstimate["geometry"];
        }>;
      };
      const route = payload.routes?.[0];
      if (!route)
        throw new AppError(
          422,
          "ROUTE_NOT_FOUND",
          "Bu noktalar arasında araç rotası bulunamadı.",
        );
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
