/** Shared Vite production split for Vercel CDN hashed `/assets` chunks. */
export function spaManualChunks(id: string) {
  if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
  if (
    id.includes('node_modules/react-dom') ||
    id.includes('node_modules/react-router') ||
    id.includes('node_modules/react/')
  ) {
    return 'react';
  }
  if (id.includes('node_modules/lucide-react')) return 'icons';
  return undefined;
}

export const spaBuild = {
  target: 'es2022' as const,
  cssCodeSplit: true,
  sourcemap: false,
  modulePreload: { polyfill: false },
  rollupOptions: {
    output: { manualChunks: spaManualChunks },
  },
};
