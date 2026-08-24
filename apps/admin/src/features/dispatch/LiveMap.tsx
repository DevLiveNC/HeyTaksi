import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapInstance } from 'maplibre-gl';
import { useEffect, useMemo, useRef } from 'react';
import type { LiveDriverMarker, LiveRideMarker } from '@heytaksi/shared';
import { mapStyleUrl } from '../../services/config';

interface Props {
  drivers: LiveDriverMarker[];
  rides: LiveRideMarker[];
  selectedRideId: string | null;
  selectedDriverId: string | null;
  onSelectDriver(driverId: string | null): void;
  onSelectRide(rideId: string | null): void;
}

const availabilityColor: Record<string, string> = {
  available: '#2fbf71',
  online: '#ffcf20',
  on_trip: '#3f8cff',
  paused: '#9a9a9a',
  offline: '#5c5c5c',
};

/** Mersin merkezi: canlı sürücü yokken haritanın açılış noktası. */
const FALLBACK_CENTER: [number, number] = [34.6415, 36.8121];

/**
 * Tile sağlayıcısına ulaşılamazsa kullanılan ağ bağımsız stil.
 * Operasyon ekibi altlık olmasa bile sürücü konumlarını görmeye devam eder.
 */
const OFFLINE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#12130f' } }],
};

/**
 * Operasyon canlı haritası.
 *
 * Sürücüler tek bir GeoJSON kaynağıyla çizilir; her konum güncellemesinde yalnızca
 * kaynak verisi değişir (marker yeniden oluşturulmaz), böylece yüzlerce sürücüde de akıcı kalır.
 */
export function LiveMap({ drivers, rides, selectedRideId, selectedDriverId, onSelectDriver, onSelectRide }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const loaded = useRef(false);
  const fitted = useRef(false);
  const handlers = useRef({ onSelectDriver, onSelectRide });
  handlers.current = { onSelectDriver, onSelectRide };
  const collections = useRef<{
    drivers: maplibregl.GeoJSONSourceSpecification['data'];
    rides: maplibregl.GeoJSONSourceSpecification['data'];
  }>({
    drivers: { type: 'FeatureCollection', features: [] },
    rides: { type: 'FeatureCollection', features: [] },
  });

  const driverCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: drivers.map((driver) => ({
        type: 'Feature' as const,
        id: driver.driverId,
        geometry: { type: 'Point' as const, coordinates: [driver.longitude, driver.latitude] as [number, number] },
        properties: {
          driverId: driver.driverId,
          driverName: driver.driverName,
          availability: driver.availability,
          plate: driver.plate ?? '',
          rating: driver.rating,
          heading: driver.heading ?? 0,
          vehicleType: driver.vehicleType ?? '',
          ageSeconds: driver.ageSeconds,
          color: availabilityColor[driver.availability] ?? availabilityColor.offline,
          // Bayat sinyaller soluk gösterilir.
          opacity: driver.ageSeconds > 25 ? 0.45 : 1,
        },
      })),
    }),
    [drivers],
  );

  const rideCollection = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: rides
        .filter((ride) => ride.pickup.latitude !== 0)
        .map((ride) => ({
          type: 'Feature' as const,
          id: ride.rideId,
          geometry: {
            type: 'Point' as const,
            coordinates: [ride.pickup.longitude, ride.pickup.latitude] as [number, number],
          },
          properties: {
            rideId: ride.rideId,
            status: ride.status,
            searching: ride.status === 'searching' ? 1 : 0,
            waitingSeconds: ride.waitingSeconds,
          },
        })),
    }),
    [rides],
  );

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: mapStyleUrl,
      center: FALLBACK_CENTER,
      zoom: 12,
      attributionControl: {},
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    // Altlık yüklenemezse çevrimdışı stile geç; katmanlar yeniden kurulur.
    let fallbackApplied = false;
    map.on('error', (event) => {
      const failedStyle = !map.isStyleLoaded() || (event.error as { status?: number } | undefined)?.status === 404;
      if (fallbackApplied || !failedStyle) return;
      fallbackApplied = true;
      loaded.current = false;
      map.setStyle(OFFLINE_STYLE);
    });

    const addLayers = () => {
      map.addSource('rides', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      // Arama bekleyen talepler: dikkat çeken kırmızı halka.
      map.addLayer({
        id: 'ride-halo',
        type: 'circle',
        source: 'rides',
        filter: ['==', ['get', 'searching'], 1],
        paint: {
          'circle-radius': 22,
          'circle-color': '#ff5a4d',
          'circle-opacity': 0.16,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ff5a4d',
        },
      });
      map.addLayer({
        id: 'ride-points',
        type: 'circle',
        source: 'rides',
        paint: {
          'circle-radius': 6,
          'circle-color': ['case', ['==', ['get', 'searching'], 1], '#ff5a4d', '#7c8cff'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0d0d0d',
        },
      });

      map.addSource('drivers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'driver-glow',
        type: 'circle',
        source: 'drivers',
        paint: {
          'circle-radius': 16,
          'circle-color': ['get', 'color'],
          'circle-opacity': ['*', 0.14, ['get', 'opacity']],
        },
      });
      map.addLayer({
        id: 'driver-points',
        type: 'circle',
        source: 'drivers',
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#111111',
        },
      });
      map.addLayer({
        id: 'driver-labels',
        type: 'symbol',
        source: 'drivers',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'plate'],
          'text-size': 10,
          'text-offset': [0, 1.4],
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#d8d8d8', 'text-halo-color': '#000000', 'text-halo-width': 1 },
      });

      for (const layer of ['driver-points', 'ride-points'] as const) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      }
      map.on('click', 'driver-points', (event) => {
        const id = event.features?.[0]?.properties?.driverId as string | undefined;
        if (id) handlers.current.onSelectDriver(id);
      });
      map.on('click', 'ride-points', (event) => {
        const id = event.features?.[0]?.properties?.rideId as string | undefined;
        if (id) handlers.current.onSelectRide(id);
      });
      loaded.current = true;
      // Stil değiştiğinde kaynaklar sıfırlanır; güncel veriyi hemen geri yükle.
      (map.getSource('drivers') as GeoJSONSource | undefined)?.setData(collections.current.drivers);
      (map.getSource('rides') as GeoJSONSource | undefined)?.setData(collections.current.rides);
    };
    map.on('load', addLayers);
    // setStyle sonrası katmanlar yeniden eklenmelidir.
    map.on('styledata', () => {
      if (!loaded.current && map.isStyleLoaded() && !map.getSource('drivers')) addLayers();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loaded.current = false;
      fitted.current = false;
    };
  }, []);

  // Canlı veriyi kaynaklara uygula.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    collections.current = { drivers: driverCollection, rides: rideCollection };
    const apply = () => {
      (map.getSource('drivers') as GeoJSONSource | undefined)?.setData(driverCollection);
      (map.getSource('rides') as GeoJSONSource | undefined)?.setData(rideCollection);
      // İlk veri geldiğinde haritayı filoya sığdır.
      if (!fitted.current && driverCollection.features.length) {
        fitted.current = true;
        const bounds = new maplibregl.LngLatBounds();
        for (const feature of driverCollection.features) bounds.extend(feature.geometry.coordinates);
        map.fitBounds(bounds, { padding: 90, maxZoom: 14, duration: 800 });
      }
    };
    if (loaded.current) apply();
    else map.once('load', apply);
  }, [driverCollection, rideCollection]);

  // Seçili kaydı haritada ortala.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const driver = selectedDriverId ? drivers.find((item) => item.driverId === selectedDriverId) : null;
    if (driver) {
      map.easeTo({ center: [driver.longitude, driver.latitude], zoom: Math.max(map.getZoom(), 14), duration: 700 });
      return;
    }
    const ride = selectedRideId ? rides.find((item) => item.rideId === selectedRideId) : null;
    if (ride && ride.pickup.latitude !== 0)
      map.easeTo({
        center: [ride.pickup.longitude, ride.pickup.latitude],
        zoom: Math.max(map.getZoom(), 14),
        duration: 700,
      });
    // Seçim değiştiğinde konum listesinden bağımsız olarak yalnızca bir kez odaklan.
  }, [selectedDriverId, selectedRideId]);

  return <div className="live-map" ref={container} role="application" aria-label="Canlı sürücü haritası" />;
}
