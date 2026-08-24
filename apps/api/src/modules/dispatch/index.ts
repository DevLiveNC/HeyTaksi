/** Faz 6: gerçek zamanlı dağıtım motoru — deterministik sıralama, teklif kuyruğu ve canlı izleme. */
export const dispatchModule = { name: 'dispatch', status: 'active' } as const;
export { DispatchService } from './dispatch.service.js';
export { dispatchPlugin, DISPATCH_TICK_MS } from './dispatch.plugin.js';
export { dispatchRoutes } from './dispatch.routes.js';
