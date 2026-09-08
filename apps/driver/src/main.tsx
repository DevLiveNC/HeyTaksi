import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, ErrorBoundary, bootstrapNativeRuntime } from '@heytaksi/ui';
import { App } from './routes/App';
import { apiBaseUrl } from './services/config';
import '../../passenger/src/styles/global.css';
import './styles/driver.css';

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
