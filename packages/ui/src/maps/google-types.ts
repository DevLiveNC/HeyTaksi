/** Google Maps JS tiplerini @types/google.maps olmadan daraltır. */
export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface MapTypeStyle {
  featureType?: string;
  elementType?: string;
  stylers: Array<Record<string, string | boolean>>;
}

export interface GoogleMapInstance {
  panTo(latLng: LatLngLiteral): void;
  setCenter(latLng: LatLngLiteral): void;
  setZoom(zoom: number): void;
  getZoom(): number | undefined;
  fitBounds(bounds: unknown, padding?: number | google.maps.Padding): void;
  addListener(event: string, handler: (event: { latLng?: { lat(): number; lng(): number } | null }) => void): { remove(): void };
}

export type GoogleMapsApi = typeof google.maps;
