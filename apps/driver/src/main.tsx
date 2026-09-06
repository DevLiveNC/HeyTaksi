import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, ErrorBoundary, bootstrapNativeRuntime } from '@heytaksi/ui';
import { setWorkerUrl } from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { App } from './routes/App';
import { apiBaseUrl } from './services/config';
import '../../passenger/src/styles/global.css';
import './styles/driver.css';

setWorkerUrl(mapLibreWorkerUrl);

const STORAGE_KEY = 'heytaksi.driver.session';

async function start() {
  await bootstrapNativeRuntime(STORAGE_KEY, 'dark');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AuthProvider apiUrl={apiBaseUrl} storageKey={STORAGE_KEY}>
        <BrowserRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </React.StrictMode>,
  );
}

void start();
