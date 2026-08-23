import * as maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  Map as MapInstance,
  MapMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { Coordinate, RouteEstimate } from "@heytaksi/shared";
interface Props {
  pickup?: Coordinate | null;
  destination?: Coordinate | null;
  route?: RouteEstimate | null;
  driverLocation?: { latitude: number; longitude: number } | null | undefined;
  onMapClick?: (coordinate: { latitude: number; longitude: number }) => void;
  className?: string;
}
export function InteractiveMap({
  pickup,
  destination,
  route,
  driverLocation,
  onMapClick,
  className = "live-map",
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
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
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);
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
    <div ref={container} className={className} aria-label="Yolculuk haritası" />
  );
}
