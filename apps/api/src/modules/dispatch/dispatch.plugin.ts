import fp from 'fastify-plugin';
import { DriverLocationStore } from '../../infrastructure/redis/driver-location.store.js';
import { LiveLocationService } from '../locations/live-location.service.js';
import { DispatchService } from './dispatch.service.js';

/** Dağıtım döngüsünün tik aralığı (ms): süresi dolan teklifleri kapatır ve sırayı ilerletir. */
export const DISPATCH_TICK_MS = 1_000;

/**
 * Dağıtım altyapısı: konum defteri, canlı konum servisi, dispatch motoru ve
 * deterministik zamanlayıcı tek bir plugin olarak kaydedilir.
 */
export const dispatchPlugin = fp(
  async (app) => {
    app.decorate('driverLocations', new DriverLocationStore(app));
    app.decorate('locationService', new LiveLocationService(app));
    app.decorate('dispatch', new DispatchService(app));

    // Zamanlayıcı: tek instance varsayımıyla çalışır. Çok instance'lı dağıtımda
    // bu döngü tek bir lider işlemde (ör. Redis kilidi) çalıştırılmalıdır.
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      void app.dispatch
        .sweep()
        .catch((error) => app.log.error({ err: error }, 'Dispatch döngüsü hatası'))
        .finally(() => {
          running = false;
        });
    }, DISPATCH_TICK_MS);
    timer.unref?.();
    app.addHook('onClose', async () => clearInterval(timer));
  },
  { name: 'dispatch', dependencies: ['database', 'redis', 'realtime-hub'] },
);
