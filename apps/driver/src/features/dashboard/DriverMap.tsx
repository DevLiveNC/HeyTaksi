import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapInstance } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { createHtmlMarker, GoogleMapHost, type HtmlMapMarker } from "@heytaksi/ui";
import type { Coordinate, DriverRideDetail, Hotspot, RouteEstimate } from "@heytaksi/shared";

interface Props {
  driverLocation: { latitude: number; longitude: number };
  hotspots?: Hotspot[];
  ride?: DriverRideDetail | null;
  navigateTo?: "pickup" | "destination";
  className?: string;
}

interface GoogleHandle {
  map: google.maps.Map;
  maps: typeof google.maps;
}

function MapLibreDriverMap({ driverLocation, hotspots = [], ride, navigateTo, className = "driver-map" }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const driverMarker = useRef<maplibregl.Marker | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: import.meta.env.VITE_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/dark",
      center: [driverLocation.longitude, driverLocation.latitude],
      zoom: 13,
      attributionControl: {},
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    const element = document.createElement("div");
    element.className = "driver-pin";
    element.setAttribute("aria-label", "Sürücü konumu");
    driverMarker.current = new maplibregl.Marker({ element })
      .setLngLat([driverLocation.longitude, driverLocation.latitude])
      .addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      driverMarker.current = null;
      markers.current = [];
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => driverMarker.current?.setLngLat([driverLocation.longitude, driverLocation.latitude]);
    if (map.isStyleLoaded()) update();
    else map.once("load", update);
  }, [driverLocation]);

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
            "circle-color": ["match", ["get", "demandLevel"], "high", "#e5484d", "medium", "#ffcf20", "#3bbb72"],
            "circle-opacity": 0.18,
          },
        });
        map.addLayer({
          id: "hotspot-core",
          type: "circle",
          source: "hotspots",
          paint: {
            "circle-radius": 6,
            "circle-color": ["match", ["get", "demandLevel"], "high", "#e5484d", "medium", "#ffcf20", "#3bbb72"],
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
            ? {
                type: "LineString" as const,
                coordinates: [
                  [driverLocation.longitude, driverLocation.latitude],
                  [ride.pickup.longitude, ride.pickup.latitude],
                ] as [number, number][],
              }
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
      }
    };
    if (map.isStyleLoaded()) render();
    else map.once("load", render);
  }, [hotspots, ride, navigateTo, driverLocation]);

  return <div ref={container} className={className} aria-label="Sürücü haritası" />;
}

function GoogleDriverLayers({
  google,
  driverLocation,
  hotspots = [],
  ride,
  navigateTo,
}: Props & { google: GoogleHandle }) {
  const pin = useRef<HtmlMapMarker | null>(null);
  const markers = useRef<HtmlMapMarker[]>([]);
  const circles = useRef<google.maps.Circle[]>([]);
  const line = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    const { map, maps } = google;
    if (!pin.current) {
      const element = document.createElement("div");
      element.className = "driver-pin";
      element.setAttribute("aria-label", "Sürücü konumu");
      pin.current = createHtmlMarker(maps, map, { lat: driverLocation.latitude, lng: driverLocation.longitude }, element);
    } else {
      pin.current.setPosition({ lat: driverLocation.latitude, lng: driverLocation.longitude });
    }
  }, [google, driverLocation]);

  useEffect(() => {
    const { map, maps } = google;
    for (const marker of markers.current) marker.setMap(null);
    markers.current = [];
    for (const circle of circles.current) circle.setMap(null);
    circles.current = [];

    for (const spot of hotspots) {
      const color = spot.demandLevel === "high" ? "#e5484d" : spot.demandLevel === "medium" ? "#ffcf20" : "#3bbb72";
      circles.current.push(
        new maps.Circle({
          map,
          center: { lat: spot.latitude, lng: spot.longitude },
          radius: 80 + spot.rideCount * 18,
          strokeWeight: 0,
          fillColor: color,
          fillOpacity: 0.18,
        }),
      );
    }

    const add = (point: Coordinate, kind: string) => {
      const element = document.createElement("div");
      element.className = `live-marker ${kind}`;
      markers.current.push(createHtmlMarker(maps, map, { lat: point.latitude, lng: point.longitude }, element));
    };
    if (ride) {
      if (navigateTo !== "destination") add(ride.pickup, "pickup");
      add(ride.destination, "destination");
    }

    const path =
      ride?.geometry && navigateTo === "destination"
        ? ride.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
        : ride && navigateTo === "pickup"
          ? [
              { lat: driverLocation.latitude, lng: driverLocation.longitude },
              { lat: ride.pickup.latitude, lng: ride.pickup.longitude },
            ]
          : [];
    if (!line.current) {
      line.current = new maps.Polyline({
        path,
        strokeColor: "#ffcf20",
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map,
      });
    } else {
      line.current.setPath(path);
      line.current.setMap(map);
    }

    if (ride) {
      const bounds = new maps.LatLngBounds();
      bounds.extend({ lat: ride.pickup.latitude, lng: ride.pickup.longitude });
      bounds.extend({ lat: ride.destination.latitude, lng: ride.destination.longitude });
      bounds.extend({ lat: driverLocation.latitude, lng: driverLocation.longitude });
      map.fitBounds(bounds, 70);
    } else {
      map.panTo({ lat: driverLocation.latitude, lng: driverLocation.longitude });
    }
  }, [google, hotspots, ride, navigateTo, driverLocation]);

  return null;
}

/** Sürücü konsolu haritası: Google Maps eklentisi, anahtar yoksa MapLibre. */
export function DriverMap(props: Props) {
  const [engine, setEngine] = useState<GoogleHandle | null>(null);
  const onReady = useCallback((map: google.maps.Map, maps: typeof google.maps) => {
    setEngine({ map, maps });
  }, []);
  return (
    <>
      <GoogleMapHost
        className={props.className ?? "driver-map"}
        ariaLabel="Sürücü haritası"
        dark
        center={{ lat: props.driverLocation.latitude, lng: props.driverLocation.longitude }}
        onReady={onReady}
        fallback={<MapLibreDriverMap {...props} />}
      />
      {engine ? <GoogleDriverLayers {...props} google={engine} /> : null}
    </>
  );
}

export type { RouteEstimate };
