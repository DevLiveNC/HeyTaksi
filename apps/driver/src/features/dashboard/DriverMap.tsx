import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapInstance } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { Coordinate, DriverRideDetail, Hotspot, RouteEstimate } from "@heytaksi/shared";

interface Props {
  driverLocation: { latitude: number; longitude: number };
  hotspots?: Hotspot[];
  ride?: DriverRideDetail | null;
  navigateTo?: "pickup" | "destination";
  className?: string;
}

/** Sürücü konsolu haritası: sürücü konumu, yoğunluk halkaları ve aktif yolculuk rotası. */
export function DriverMap({ driverLocation, hotspots = [], ride, navigateTo, className = "driver-map" }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const driverMarker = useRef<maplibregl.Marker | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style:
        import.meta.env.VITE_MAP_STYLE_URL ??
        "https://tiles.openfreemap.org/styles/dark",
      center: [driverLocation.longitude, driverLocation.latitude],
      zoom: 13,
      attributionControl: {},
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    const element = document.createElement("div");
    element.className = "driver-pin";
    element.setAttribute("aria-label", "Sürücü konumu");
    driverMarker.current = new maplibregl.Marker({ element }).setLngLat([
      driverLocation.longitude,
      driverLocation.latitude,
    ]).addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      driverMarker.current = null;
      markers.current = [];
    };
  }, []);

  // Sürücü konumu: marker'ı canlı güncelle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () =>
      driverMarker.current?.setLngLat([driverLocation.longitude, driverLocation.latitude]);
    if (map.isStyleLoaded()) update();
    else map.once("load", update);
  }, [driverLocation]);

  // Yoğunluk halkaları + yolculuk işaretleri.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const render = () => {
      const hotspotSource = map.getSource("hotspots") as GeoJSONSource | undefined;
      const feature = (spot: Hotspot) => ({
        type: "Feature" as const,
        properties: { id: spot.id, rideCount: spot.rideCount, demandLevel: spot.demandLevel },
        geometry: { type: "Point" as const, coordinates: [spot.longitude, spot.latitude] },
      });
      if (hotspotSource) hotspotSource.setData({ type: "FeatureCollection", features: hotspots.map(feature) });
      else if (map.isStyleLoaded()) {
        map.addSource("hotspots", {
          type: "geojson",
          data: { type: "FeatureCollection", features: hotspots.map(feature) },
        });
        map.addLayer({
          id: "hotspot-halo",
          type: "circle",
          source: "hotspots",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "rideCount"], 1, 16, 12, 40],
            "circle-color": [
              "match",
              ["get", "demandLevel"],
              "high", "#e5484d",
              "medium", "#ffcf20",
              "#3bbb72",
            ],
            "circle-opacity": 0.18,
          },
        });
        map.addLayer({
          id: "hotspot-core",
          type: "circle",
          source: "hotspots",
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "match",
              ["get", "demandLevel"],
              "high", "#e5484d",
              "medium", "#ffcf20",
              "#3bbb72",
            ],
          },
        });
      }

      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      const add = (point: Coordinate, kind: string) => {
        const element = document.createElement("div");
        element.className = `live-marker ${kind}`;
        markers.current.push(
          new maplibregl.Marker({ element }).setLngLat([point.longitude, point.latitude]).addTo(map),
        );
      };
      if (ride) {
        if (navigateTo !== "destination") add(ride.pickup, "pickup");
        add(ride.destination, "destination");
      }

      const geometry =
        ride?.geometry && navigateTo === "destination"
          ? ride.geometry
          : ride && navigateTo === "pickup" && !ride.geometry
            ? { type: "LineString" as const, coordinates: [[driverLocation.longitude, driverLocation.latitude], [ride.pickup.longitude, ride.pickup.latitude]] as [number, number][] }
            : { type: "LineString" as const, coordinates: [] };
      const routeSource = map.getSource("route") as GeoJSONSource | undefined;
      if (routeSource) routeSource.setData({ type: "Feature", properties: {}, geometry });
      else if (map.isStyleLoaded() && geometry.coordinates.length) {
        map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry } });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: { "line-color": "#ffcf20", "line-width": 5, "line-opacity": 0.9 },
        });
      }

      if (ride) {
        const bounds = new maplibregl.LngLatBounds(
          [ride.pickup.longitude, ride.pickup.latitude],
          [ride.destination.longitude, ride.destination.latitude],
        );
        bounds.extend([driverLocation.longitude, driverLocation.latitude]);
        map.fitBounds(bounds, { padding: 70, maxZoom: 15 });
      } else if (hotspots[0]) {
        map.fitBounds(
          new maplibregl.LngLatBounds(
            [hotspots[0].longitude, hotspots[0].latitude],
            [hotspots[0].longitude, hotspots[0].latitude],
          ),
          { padding: 70, maxZoom: 13 },
        );
      }
    };
    if (map.isStyleLoaded()) render();
    else map.once("load", render);
  }, [hotspots, ride, navigateTo, driverLocation]);

  return <div ref={container} className={className} aria-label="Sürücü haritası" />;
}

export type { RouteEstimate };
