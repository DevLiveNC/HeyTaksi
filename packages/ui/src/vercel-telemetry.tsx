import { useEffect } from 'react';

/**
 * Vercel Web Analytics + Speed Insights. Production only; missing packages
 * (local/native builds) are ignored so the SPA still boots.
 */
export function VercelTelemetry() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    void Promise.all([
      import('@vercel/analytics').then((mod) => {
        mod.inject();
      }),
      import('@vercel/speed-insights').then((mod) => {
        mod.injectSpeedInsights();
      }),
    ]).catch(() => undefined);
  }, []);
  return null;
}
