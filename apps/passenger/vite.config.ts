import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

process.env.VITE_MAP_PROVIDER ??= 'osm';
process.env.VITE_MAP_STYLE_URL ??= 'https://tiles.openfreemap.org/styles/liberty';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: 5173,
    headers: {
      'Permissions-Policy': 'geolocation=(self)',
    },
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
