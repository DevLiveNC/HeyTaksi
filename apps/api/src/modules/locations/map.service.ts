import type { Coordinate, RouteEstimate } from "@heytaksi/shared";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";

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
  }

  async reverse(latitude: number, longitude: number) {
    const url = new URL("/reverse", env.GEOCODING_URL);
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
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
  }

  async route(
    pickup: Coordinate,
    destination: Coordinate,
  ): Promise<RouteEstimate> {
    const path = `/route/v1/driving/${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}`;
    const url = new URL(path, env.ROUTING_URL);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
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
  }
}
