import type { FastifyPluginAsync } from 'fastify';
import type { RealtimeEnvelope } from '@heytaksi/shared';

const envelope = (event: string, data: unknown): RealtimeEnvelope => ({ event, data, timestamp: new Date().toISOString() });

export const realtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { websocket: true }, (socket) => {
    socket.send(JSON.stringify(envelope('connection.ready', { authenticated: false })));
    socket.on('message', (raw: Buffer) => {
      try {
        const message = JSON.parse(raw.toString()) as { event?: string; data?: unknown };
        if (message.event === 'ping') socket.send(JSON.stringify(envelope('pong', message.data ?? null)));
        else socket.send(JSON.stringify(envelope('error', { code: 'UNKNOWN_EVENT' })));
      } catch { socket.send(JSON.stringify(envelope('error', { code: 'INVALID_MESSAGE' }))); }
    });
  });
};
