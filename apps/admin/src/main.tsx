import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@heytaksi/ui';
import { App } from './routes/App';
import { apiBaseUrl } from './services/config';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/global.css';
import './styles/dispatch.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider apiUrl={apiBaseUrl} storageKey="heytaksi.admin.session">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
