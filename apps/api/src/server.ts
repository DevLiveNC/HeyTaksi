import { env } from './config/env.js';
import { buildApp } from './app.js';

const app = await buildApp();
const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Sunucu kapatılıyor');
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
try { await app.listen({ host: env.HOST, port: env.PORT }); }
catch (error) { app.log.fatal(error); process.exit(1); }
