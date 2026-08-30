import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

process.env.VITE_MAP_PROVIDER ??= 'osm';
process.env.VITE_MAP_STYLE_URL ??= 'https://tiles.openfreemap.org/styles/liberty';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: 5175,
    // Tarayıcı API'ye aynı origin üzerinden erişir; preview/proxy ortamlarında da çalışır.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
