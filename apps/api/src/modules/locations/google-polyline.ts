/**
 * Google Encoded Polyline Algorithm Format çözücüsü.
 * Directions API `overview_polyline.points` değerini GeoJSON [lng, lat] dizisine çevirir.
 * @see https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodeGooglePolyline(encoded: string, precision = 5): [number, number][] {
  const coordinates: [number, number][] = [];
  const factor = 10 ** precision;
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    latitude += nextDelta();
    longitude += nextDelta();
    coordinates.push([longitude / factor, latitude / factor]);
  }
  return coordinates;

  function nextDelta(): number {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}
