import type { MapTypeStyle } from './google-types';

/** Yolcu uygulaması: açık, sade altlık. */
export const GOOGLE_MAP_LIGHT_STYLES: MapTypeStyle[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'landscape', stylers: [{ color: '#f3f2ec' }] },
  { featureType: 'water', stylers: [{ color: '#d7e4ef' }] },
];

/** Sürücü ve operasyon: koyu altlık. */
export const GOOGLE_MAP_DARK_STYLES: MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1b1c18' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b8b8b0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1b1c18' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2b26' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a82' }] },
  { featureType: 'water', stylers: [{ color: '#151618' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3a3b36' }] },
];
