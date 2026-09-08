import fp from 'fastify-plugin';
import { shouldRunDispatchTimer } from '../../config/runtime.js';
import { runInBackground } from '../../core/http/background.js';
import { DriverLocationStore } from '../../infrastructure/redis/driver-location.store.js';
import { LiveLocationService } from '../locations/live-location.service.js';
import { DispatchService } from './dispatch.service.js';

/** Dağıtım döngüsünün tik aralığı (ms): süresi dolan teklifleri kapatır ve sırayı ilerletir. */
export const DISPATCH_TICK_MS = 1_000;

const DISPATCH_REQUEST_PATH = /\/(rides|dispatch|drivers)\//;

/**
 * Dağıtım altyapısı: konum defteri, canlı konum servisi, dispatch motoru ve
 * deterministik zamanlayıcı tek bir plugin olarak kaydedilir.
 */
export const dispatchPlugin = fp(
  async (app) => {
    app.decorate('driverLocations', new DriverLocationStore(app));
    app.decorate('locationService', new LiveLocationService(app));
    app.decorate('dispatch', new DispatchService(app));

    let running = false;
    const sweep = () => {
      if (running) return;
      running = true;
      const task = app.dispatch
        .sweep()
        .catch((error) => app.log.error({ err: error }, 'Dispatch döngüsü hatası'))
        .finally(() => {
          running = false;
        });
      runInBackground(task);
    };

    if (shouldRunDispatchTimer()) {
      // Zamanlayıcı: tek instance varsayımıyla çalışır. Çok instance'lı dağıtımda
      // bu döngü tek bir lider işlemde (ör. Redis kilidi) çalıştırılmalıdır.
      const timer = setInterval(sweep, DISPATCH_TICK_MS);
      timer.unref?.();
      app.addHook('onClose', async () => clearInterval(timer));
      return;
    }

    // Vercel Functions donduğu için setInterval teklifleri süresi dolunca kapatamaz.
    // Ride/dispatch isteklerinde arka planda süpür; Cron `/dispatch/tick` yedektir.
    let lastSweep = 0;
    app.addHook('onRequest', (request, _reply, done) => {
      const url = request.url ?? '';
      if (!DISPATCH_REQUEST_PATH.test(url)) {
        done();
        return;
      }
      const now = Date.now();
      if (now - lastSweep < DISPATCH_TICK_MS) {
        done();
        return;
      }
      lastSweep = now;
      sweep();
      done();
    });
  },
  { name: 'dispatch', dependencies: ['database', 'redis', 'realtime-hub'] },
);
