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
  /** Artınca kamera alış noktasına yeniden ortalanır (konumum düğmesi). */
  recenterToken?: number;
  className?: string;
}

interface GoogleHandle {
  map: google.maps.Map;
  maps: typeof google.maps;
}

function upsertMapLibreMarker(
  map: MapInstance,
  current: maplibregl.Marker | null,
  point: { latitude: number; longitude: number } | null | undefined,
  kind: string,
  label: string,
): maplibregl.Marker | null {
  if (!point) {
    current?.remove();
    return null;
  }
  if (current) {
    current.setLngLat([point.longitude, point.latitude]);
    return current;
  }
  const element = document.createElement("div");
  element.className = `live-marker ${kind}`;
  element.setAttribute("aria-label", label);
  element.style.pointerEvents = "none";
  return new maplibregl.Marker({ element }).setLngLat([point.longitude, point.latitude]).addTo(map);
}

function MapLibreInteractiveMap({
  pickup,
  destination,
  route,
  driverLocation,
  nearbyDrivers,
  onMapClick,
  recenterToken = 0,
  className = "live-map",
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const pickupMarker = useRef<maplibregl.Marker | null>(null);
  const destinationMarker = useRef<maplibregl.Marker | null>(null);
  const driverMarker = useRef<maplibregl.Marker | null>(null);
  const nearbyMarkers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const lastCamera = useRef("");
  const lastRecenter = useRef(0);
  const userMoved = useRef(false);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: osmStyleUrl("light"),
      ...osmKktcMapView(
        pickup && isInKktcServiceArea(pickup.latitude, pickup.longitude) ? pickup : DEFAULT_MAP_CENTER,
      ),
      attributionControl: {},
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("click", (event: MapMouseEvent) =>
      clickRef.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }),
    );
    map.on("dragstart", () => {
      userMoved.current = true;
    });
    const unwire = wireOsmMap(map);
    mapRef.current = map;
    return () => {
      unwire();
      pickupMarker.current?.remove();
      destinationMarker.current?.remove();
      driverMarker.current?.remove();
      pickupMarker.current = null;
      destinationMarker.current = null;
      driverMarker.current = null;
      map.remove();
      mapRef.current = null;
      nearbyMarkers.current.clear();
    };
    // İlk merkez yalnızca kurulumda; GPS sonradan easeTo ile gelir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      element.style.pointerEvents = "none";
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
    const update = () => {
      pickupMarker.current = upsertMapLibreMarker(map, pickupMarker.current, pickup, "pickup", "Alış noktası");
      destinationMarker.current = upsertMapLibreMarker(
        map,
        destinationMarker.current,
        destination,
        "destination",
        "Varış noktası",
      );
      driverMarker.current = upsertMapLibreMarker(
        map,
        driverMarker.current,
        driverLocation,
        "driver",
        "Sürücü konumu",
      );
      const data = route?.geometry ?? { type: "LineString" as const, coordinates: [] };
      const source = map.getSource("route") as GeoJSONSource | undefined;
      if (source) source.setData({ type: "Feature", properties: {}, geometry: data });
      else if (map.isStyleLoaded()) {
        map.addSource("route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: data },
        });
        if (!map.getLayer("route-line")) {
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            paint: { "line-color": "#171813", "line-width": 5, "line-opacity": 0.88 },
          });
        }
      }
      const nextCamera = cameraKey(pickup, destination, route);
      const forceRecenter = recenterToken !== lastRecenter.current;
      if (nextCamera === lastCamera.current && !forceRecenter) return;
      lastCamera.current = nextCamera;
      lastRecenter.current = recenterToken;
      if (pickup && destination) {
        const bounds = new maplibregl.LngLatBounds(
          [pickup.longitude, pickup.latitude],
          [pickup.longitude, pickup.latitude],
        );
        bounds.extend([destination.longitude, destination.latitude]);
        userMoved.current = false;
        map.fitBounds(bounds, { padding: 70, maxZoom: 15 });
      } else if (
        pickup &&
        isInKktcServiceArea(pickup.latitude, pickup.longitude) &&
        (!userMoved.current || forceRecenter)
      ) {
        map.easeTo({ center: [pickup.longitude, pickup.latitude], duration: forceRecenter ? 250 : 400 });
      }
    };
    if (map.isStyleLoaded()) update();
    else map.once("load", update);
    return () => {
      map.off("load", update);
    };
  }, [pickup, destination, route, driverLocation, recenterToken]);

  return <div ref={container} className={className} aria-label="Yolculuk haritası" />;
}

function upsertGoogleMarker(
  maps: typeof google.maps,
  map: google.maps.Map,
  current: HtmlMapMarker | null,
  point: { latitude: number; longitude: number } | null | undefined,
  kind: string,
  label: string,
): HtmlMapMarker | null {
  if (!point) {
    current?.setMap(null);
    return null;
  }
  if (current) {
    current.setPosition({ lat: point.latitude, lng: point.longitude });
    return current;
  }
  const element = document.createElement("div");
  element.className = `live-marker ${kind}`;
  element.setAttribute("aria-label", label);
  element.style.pointerEvents = "none";
  return createHtmlMarker(maps, map, { lat: point.latitude, lng: point.longitude }, element);
}

function GoogleInteractiveMap({
  pickup,
  destination,
  route,
  driverLocation,
  nearbyDrivers,
  google,
  recenterToken = 0,
  className = "live-map",
}: Props & { google: GoogleHandle }) {
  const pickupMarker = useRef<HtmlMapMarker | null>(null);
  const destinationMarker = useRef<HtmlMapMarker | null>(null);
  const driverMarker = useRef<HtmlMapMarker | null>(null);
  const nearby = useRef<Map<string, HtmlMapMarker>>(new Map());
  const line = useRef<google.maps.Polyline | null>(null);
  const lastCamera = useRef("");
  const lastRecenter = useRef(0);
  const userMoved = useRef(false);

  useEffect(() => {
    const listener = google.map.addListener("dragstart", () => {
      userMoved.current = true;
    });
    return () => listener.remove();
  }, [google.map]);

  useEffect(() => {
    const { map, maps } = google;
    const seen = new Set<string>();
    for (const driver of nearbyDrivers ?? []) {
      seen.add(driver.id);
      const existing = nearby.current.get(driver.id);
      if (existing) {
        existing.setPosition({ lat: driver.latitude, lng: driver.longitude });
        existing.setHeading(driver.heading ?? 0);
        continue;
      }
      const element = document.createElement("div");
      element.className = "live-marker nearby-taxi";
      element.setAttribute("aria-label", "Yakındaki boş taksi");
      element.style.pointerEvents = "none";
      const marker = createHtmlMarker(maps, map, { lat: driver.latitude, lng: driver.longitude }, element);
      marker.setHeading(driver.heading ?? 0);
      nearby.current.set(driver.id, marker);
    }
    for (const [id, marker] of nearby.current)
      if (!seen.has(id)) {
        marker.setMap(null);
        nearby.current.delete(id);
      }
  }, [google, nearbyDrivers]);

  useEffect(() => {
    const { map, maps } = google;
    pickupMarker.current = upsertGoogleMarker(maps, map, pickupMarker.current, pickup, "pickup", "Alış noktası");
    destinationMarker.current = upsertGoogleMarker(
      maps,
      map,
      destinationMarker.current,
      destination,
      "destination",
      "Varış noktası",
    );
    driverMarker.current = upsertGoogleMarker(
      maps,
      map,
      driverMarker.current,
      driverLocation,
      "driver",
      "Sürücü konumu",
    );

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
    const forceRecenter = recenterToken !== lastRecenter.current;
    if (nextCamera !== lastCamera.current || forceRecenter) {
      lastCamera.current = nextCamera;
      lastRecenter.current = recenterToken;
      if (pickup && destination) {
        const bounds = new maps.LatLngBounds();
        bounds.extend({ lat: pickup.latitude, lng: pickup.longitude });
        bounds.extend({ lat: destination.latitude, lng: destination.longitude });
        userMoved.current = false;
        map.fitBounds(bounds, 70);
      } else if (
        pickup &&
        isInKktcServiceArea(pickup.latitude, pickup.longitude) &&
        (!userMoved.current || forceRecenter)
      ) {
        map.panTo({ lat: pickup.latitude, lng: pickup.longitude });
      }
    }
    return () => {
      /* işaretçiler bir sonraki senkrona kadar yerinde kalır; unmount GoogleMapHost'ta */
    };
  }, [google, pickup, destination, route, driverLocation, recenterToken]);

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
