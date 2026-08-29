import type { GoogleMapsApi, LatLngLiteral } from './google-types';

export interface HtmlMapMarker {
  setPosition(position: LatLngLiteral): void;
  setHeading(degrees: number): void;
  setMap(map: google.maps.Map | null): void;
}

let MarkerCtor: (new (args: {
  maps: GoogleMapsApi;
  position: LatLngLiteral;
  element: HTMLElement;
}) => HtmlMapMarker) | null = null;

function markerClass(maps: GoogleMapsApi) {
  if (MarkerCtor) return MarkerCtor;
  class HtmlOverlay extends maps.OverlayView implements HtmlMapMarker {
    private position: LatLngLiteral;
    private readonly element: HTMLElement;
    constructor(args: { maps: GoogleMapsApi; position: LatLngLiteral; element: HTMLElement }) {
      super();
      this.position = args.position;
      this.element = args.element;
      this.element.style.position = 'absolute';
      this.element.style.transform = 'translate(-50%, -50%)';
    }
    onAdd() {
      this.getPanes()?.overlayMouseTarget.appendChild(this.element);
    }
    draw() {
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(new maps.LatLng(this.position.lat, this.position.lng));
      if (!point) return;
      this.element.style.left = `${point.x}px`;
      this.element.style.top = `${point.y}px`;
    }
    onRemove() {
      this.element.remove();
    }
    setPosition(position: LatLngLiteral) {
      this.position = position;
      this.draw();
    }
    setHeading(degrees: number) {
      this.element.style.rotate = `${degrees}deg`;
    }
    override setMap(map: google.maps.Map | null) {
      super.setMap(map);
    }
  }
  MarkerCtor = HtmlOverlay as unknown as typeof MarkerCtor;
  return MarkerCtor!;
}

export function createHtmlMarker(
  maps: GoogleMapsApi,
  map: google.maps.Map,
  position: LatLngLiteral,
  element: HTMLElement,
): HtmlMapMarker {
  const Ctor = markerClass(maps);
  const marker = new Ctor({ maps, position, element });
  marker.setMap(map);
  return marker;
}
