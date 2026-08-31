import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapInstance, MapMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createHtmlMarker,
  DEFAULT_MAP_CENTER,
  GoogleMapHost,
  osmKktcMapView,
  osmStyleUrl,
  wireOsmMap,
} from "@heytaksi/ui";
import type { HtmlMapMarker } from "@heytaksi/ui";
import { isInKktcServiceArea, type Coordinate, type RouteEstimate } from "@heytaksi/shared";

function cameraKey(
  pickup?: Coordinate | null,
  destination?: Coordinate | null,
  route?: RouteEstimate | null,
): string {
  const point = (value?: Coordinate | null) =>
    value ? `${value.latitude.toFixed(3)},${value.longitude.toFixed(3)}` : "";
  return `${point(pickup)}|${point(destination)}|${route?.distanceMeters ?? ""}`;
}

interface Props {
  pickup?: Coordinate | null;
  destination?: Coordinate | null;
  route?: RouteEstimate | null;
  driverLocation?: { latitude: number; longitude: number } | null | undefined;
  nearbyDrivers?: Array<{ id: string; latitude: number; longitude: number; heading: number | null }>;
  onMapClick?: (coordinate: { latitude: number; longitude: number }) => void;
  className?: string;
}

interface GoogleHandle {
  map: google.maps.Map;
  maps: typeof google.maps;
}

function MapLibreInteractiveMap({
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
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: osmStyleUrl("light"),
      ...osmKktcMapView(
        pickup && isInKktcServiceArea(pickup.latitude, pickup.longitude) ? pickup : DEFAULT_MAP_CENTER,
      ),
      attributionControl: {},
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("click", (event: MapMouseEvent) =>
      onMapClick?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }),
    );
    const unwire = wireOsmMap(map);
    mapRef.current = map;
    return () => {
      unwire();
      map.remove();
      mapRef.current = null;
      nearbyMarkers.current.clear();
    };
  }, []);

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

  const lastCamera = useRef("");
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
        new maplibregl.Marker({ element }).setLngLat([point.longitude, point.latitude]).addTo(map),
      );
    };
    if (pickup) add(pickup, "pickup");
    if (destination) add(destination, "destination");
    if (driverLocation) add({ ...driverLocation, address: "Sürücü konumu" }, "driver");
    const nextCamera = cameraKey(pickup, destination, route);
    if (nextCamera !== lastCamera.current) {
      lastCamera.current = nextCamera;
      if (pickup && destination) {
        const bounds = new maplibregl.LngLatBounds(
          [pickup.longitude, pickup.latitude],
          [pickup.longitude, pickup.latitude],
        );
        bounds.extend([destination.longitude, destination.latitude]);
        map.fitBounds(bounds, { padding: 70, maxZoom: 15 });
      } else if (pickup && isInKktcServiceArea(pickup.latitude, pickup.longitude)) {
        map.easeTo({ center: [pickup.longitude, pickup.latitude], duration: 400 });
      }
    }
    const update = () => {
      const data = route?.geometry ?? { type: "LineString" as const, coordinates: [] };
      const source = map.getSource("route") as GeoJSONSource | undefined;
      if (source) source.setData({ type: "Feature", properties: {}, geometry: data });
      else if (map.isStyleLoaded()) {
        map.addSource("route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: data },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: { "line-color": "#171813", "line-width": 5, "line-opacity": 0.88 },
        });
      }
    };
    if (map.isStyleLoaded()) update();
    else map.once("load", update);
  }, [pickup, destination, route, driverLocation]);

  return <div ref={container} className={className} aria-label="Yolculuk haritası" />;
}

function GoogleInteractiveMap({
  pickup,
  destination,
  route,
  driverLocation,
  nearbyDrivers,
  google,
  className = "live-map",
}: Props & { google: GoogleHandle }) {
  const pointMarkers = useRef<HtmlMapMarker[]>([]);
  const nearby = useRef<Map<string, HtmlMapMarker>>(new Map());
  const line = useRef<google.maps.Polyline | null>(null);
  const lastCamera = useRef("");

  useEffect(() => {
    const { map, maps } = google;
    for (const marker of nearby.current.values()) marker.setMap(null);
    nearby.current.clear();
    for (const driver of nearbyDrivers ?? []) {
      const element = document.createElement("div");
      element.className = "live-marker nearby-taxi";
      element.setAttribute("aria-label", "Yakındaki boş taksi");
      const marker = createHtmlMarker(maps, map, { lat: driver.latitude, lng: driver.longitude }, element);
      marker.setHeading(driver.heading ?? 0);
      nearby.current.set(driver.id, marker);
    }
    return () => {
      for (const marker of nearby.current.values()) marker.setMap(null);
      nearby.current.clear();
    };
  }, [google, nearbyDrivers]);

  useEffect(() => {
    const { map, maps } = google;
    for (const marker of pointMarkers.current) marker.setMap(null);
    pointMarkers.current = [];
    const add = (point: { latitude: number; longitude: number }, kind: string, label: string) => {
      const element = document.createElement("div");
      element.className = `live-marker ${kind}`;
      element.setAttribute("aria-label", label);
      pointMarkers.current.push(
        createHtmlMarker(maps, map, { lat: point.latitude, lng: point.longitude }, element),
      );
    };
    if (pickup) add(pickup, "pickup", "Alış noktası");
    if (destination) add(destination, "destination", "Varış noktası");
    if (driverLocation) add(driverLocation, "driver", "Sürücü konumu");

    const path = (route?.geometry?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng }));
    if (!line.current) {
      line.current = new maps.Polyline({
        path,
        strokeColor: "#171813",
        strokeOpacity: 0.88,
        strokeWeight: 5,
        map,
      });
    } else {
      line.current.setPath(path);
      line.current.setMap(map);
    }

    const nextCamera = cameraKey(pickup, destination, route);
    if (nextCamera !== lastCamera.current) {
      lastCamera.current = nextCamera;
      if (pickup && destination) {
        const bounds = new maps.LatLngBounds();
        bounds.extend({ lat: pickup.latitude, lng: pickup.longitude });
        bounds.extend({ lat: destination.latitude, lng: destination.longitude });
        map.fitBounds(bounds, 70);
      } else if (pickup && isInKktcServiceArea(pickup.latitude, pickup.longitude)) {
        map.panTo({ lat: pickup.latitude, lng: pickup.longitude });
      }
    }
    return () => {
      for (const marker of pointMarkers.current) marker.setMap(null);
      pointMarkers.current = [];
    };
  }, [google, pickup, destination, route, driverLocation]);

  return <div className={`${className}-google-layers`} hidden />;
}

export function InteractiveMap(props: Props) {
  const [engine, setEngine] = useState<GoogleHandle | null>(null);
  const onReady = useCallback((map: google.maps.Map, maps: typeof google.maps) => {
    setEngine({ map, maps });
  }, []);
  const className = props.className ?? "live-map";
  return (
    <div className={`${className}-wrap`} style={{ position: "relative", minHeight: 160, height: "100%" }}>
      <GoogleMapHost
        className={className}
        ariaLabel="Yolculuk haritası"
        center={{
          lat:
            props.pickup && isInKktcServiceArea(props.pickup.latitude, props.pickup.longitude)
              ? props.pickup.latitude
              : DEFAULT_MAP_CENTER.latitude,
          lng:
            props.pickup && isInKktcServiceArea(props.pickup.latitude, props.pickup.longitude)
              ? props.pickup.longitude
              : DEFAULT_MAP_CENTER.longitude,
        }}
        {...(props.onMapClick
          ? { onClick: (latitude: number, longitude: number) => props.onMapClick?.({ latitude, longitude }) }
          : {})}
        onReady={onReady}
        fallback={<MapLibreInteractiveMap {...props} />}
      />
      {engine ? <GoogleInteractiveMap {...props} google={engine} /> : null}
    </div>
  );
}
