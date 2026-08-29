import * as maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  Map as MapInstance,
  MapMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Coordinate, RouteEstimate } from "@heytaksi/shared";
interface Props {
  pickup?: Coordinate | null;
  destination?: Coordinate | null;
  route?: RouteEstimate | null;
  driverLocation?: { latitude: number; longitude: number } | null | undefined;
  /** Faz 6: haritada gösterilen canlı boş taksiler (anonim). */
  nearbyDrivers?: Array<{ id: string; latitude: number; longitude: number; heading: number | null }>;
  onMapClick?: (coordinate: { latitude: number; longitude: number }) => void;
  className?: string;
}
export function InteractiveMap({
  pickup,
  destination,
  route,
  driverLocation,
  nearbyDrivers,
  onMapClick,
  className = "live-map",
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const nearbyMarkers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [styleFailed, setStyleFailed] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style:
        import.meta.env.VITE_MAP_STYLE_URL ??
        "https://tiles.openfreemap.org/styles/positron",
      center: [pickup?.longitude ?? 34.6415, pickup?.latitude ?? 36.8121],
      zoom: 13,
      attributionControl: {},
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.on("click", (event: MapMouseEvent) =>
      onMapClick?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }),
    );
    map.on("error", () => setStyleFailed(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      nearbyMarkers.current.clear();
    };
  }, []);

  // Canlı boş taksiler: marker'lar kimliğe göre yeniden kullanılır, konum akıcı güncellenir.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const driver of nearbyDrivers ?? []) {
      seen.add(driver.id);
      const existing = nearbyMarkers.current.get(driver.id);
      if (existing) {
        existing.setLngLat([driver.longitude, driver.latitude]);
        (existing.getElement() as HTMLElement).style.rotate = `${driver.heading ?? 0}deg`;
        continue;
      }
      const element = document.createElement("div");
      element.className = "live-marker nearby-taxi";
      element.setAttribute("aria-label", "Yakındaki boş taksi");
      element.style.rotate = `${driver.heading ?? 0}deg`;
      nearbyMarkers.current.set(
        driver.id,
        new maplibregl.Marker({ element }).setLngLat([driver.longitude, driver.latitude]).addTo(map),
      );
    }
    for (const [id, marker] of nearbyMarkers.current)
      if (!seen.has(id)) {
        marker.remove();
        nearbyMarkers.current.delete(id);
      }
  }, [nearbyDrivers]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const add = (point: Coordinate, kind: string) => {
      const element = document.createElement("div");
      element.className = `live-marker ${kind}`;
      element.setAttribute(
        "aria-label",
        kind === "pickup" ? "Alış noktası" : kind === "driver" ? "Sürücü konumu" : "Varış noktası",
      );
      markers.current.push(
        new maplibregl.Marker({ element })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map),
      );
    };
    if (pickup) add(pickup, "pickup");
    if (destination) add(destination, "destination");
    if (driverLocation) add({ ...driverLocation, address: "Sürücü konumu" }, "driver");
    if (pickup && destination) {
      const bounds = new maplibregl.LngLatBounds(
        [pickup.longitude, pickup.latitude],
        [pickup.longitude, pickup.latitude],
      );
      bounds.extend([destination.longitude, destination.latitude]);
      map.fitBounds(bounds, { padding: 70, maxZoom: 15 });
    }
    const update = () => {
      const data = route?.geometry ?? {
        type: "LineString" as const,
        coordinates: [],
      };
      const source = map.getSource("route") as GeoJSONSource | undefined;
      if (source)
        source.setData({ type: "Feature", properties: {}, geometry: data });
      else if (map.isStyleLoaded()) {
        map.addSource("route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: data },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#171813",
            "line-width": 5,
            "line-opacity": 0.88,
          },
        });
      }
    };
    if (map.isStyleLoaded()) update();
    else map.once("load", update);
  }, [pickup, destination, route, driverLocation]);
  return (
    <div className={`${className}-wrap`} style={{ position: "relative", minHeight: 160 }}>
      <div ref={container} className={className} aria-label="Yolculuk haritası" />
      {styleFailed && (
        <div className="map-fallback" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          Harita altlığı yüklenemedi. Konum işaretleri görünmeye devam eder.
        </div>
      )}
    </div>
  );
}
