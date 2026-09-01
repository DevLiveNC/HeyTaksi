import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, ErrorBoundary } from '@heytaksi/ui';
import { setWorkerUrl } from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { App } from './routes/App';
import { apiBaseUrl } from './services/config';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/global.css';
import './styles/phase3.css';

// MapLibre v6: Vite üretim derlemesinde vektör karoları (sokak, parsel, etiket) worker'sız yüklenmez.
setWorkerUrl(mapLibreWorkerUrl);

/** Yerel test: `?mockGeo=1` Lefkoşa GPS’i verir (`lat` / `lng` ile değiştirilebilir). */
function installDevGeoMock() {
  if (!import.meta.env.DEV || typeof navigator === 'undefined' || !navigator.geolocation) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('mockGeo') !== '1') return;
  const latitude = Number(params.get('lat') || '35.1856');
  const longitude = Number(params.get('lng') || '33.3823');
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const coords: GeolocationCoordinates = {
    latitude,
    longitude,
    accuracy: 12,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() {
      return this;
    },
  };
  const position = {
    coords,
    timestamp: Date.now(),
    toJSON() {
      return this;
    },
  } as GeolocationPosition;
  const geo: Geolocation = {
    getCurrentPosition(success) {
      success(position);
    },
    watchPosition(success) {
      success(position);
      return 1;
    },
    clearWatch() {
      /* mock */
    },
  };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
  if (navigator.permissions?.query) {
    const original = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (descriptor: PermissionDescriptor) => {
      if (descriptor.name === 'geolocation') {
        return Promise.resolve({
          name: 'geolocation',
          state: 'granted',
          onchange: null,
          addEventListener() {
            /* mock */
          },
          removeEventListener() {
            /* mock */
          },
          dispatchEvent() {
            return false;
          },
        } as unknown as PermissionStatus);
      }
      return original(descriptor);
    };
  }
}

installDevGeoMock();

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider apiUrl={apiBaseUrl} storageKey="heytaksi.passenger.session"><BrowserRouter><ErrorBoundary><App /></ErrorBoundary></BrowserRouter></AuthProvider></React.StrictMode>);
