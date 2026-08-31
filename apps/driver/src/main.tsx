import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, ErrorBoundary } from '@heytaksi/ui';
import { setWorkerUrl } from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { App } from './routes/App';
import { apiBaseUrl } from './services/config';
import '../../passenger/src/styles/global.css';
import './styles/driver.css';

setWorkerUrl(mapLibreWorkerUrl);

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider apiUrl={apiBaseUrl} storageKey="heytaksi.driver.session"><BrowserRouter><ErrorBoundary><App /></ErrorBoundary></BrowserRouter></AuthProvider></React.StrictMode>);
