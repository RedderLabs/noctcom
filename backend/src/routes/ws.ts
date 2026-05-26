/**
 * WebSocket de sincronización.
 * El servidor solo envía notificaciones de "algo cambió" — nunca el contenido.
 * Cliente reacciona pidiendo la nueva metadata cifrada por HTTP.
 */

import type { FastifyPluginAsync } from 'fastify';
import { createSubscriber } from '../db/redis.js';

const wsRoutes: FastifyPluginAsync = async (app) => {

  app.get('/sync', { websocket: true }, async (socket, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) {
      socket.close(4001, 'missing token');
      return;
    }

    let userId: string;
    try {
      const decoded = app.jwt.verify<{ sub: string }>(token);
      userId = decoded.sub;
    } catch {
      socket.close(4001, 'invalid token');
      return;
    }

    app.log.info({ userId }, 'ws connected');
    socket.send(JSON.stringify({ type: 'hello', ts: Date.now() }));

    const subscriber = await createSubscriber();
    if (subscriber) {
      const channel = `user:${userId}`;
      await subscriber.subscribe(channel, (message) => {
        try {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'change', ...JSON.parse(message) }));
          }
        } catch { /* ignore */ }
      });

      socket.on('close', async () => {
        app.log.info({ userId }, 'ws disconnected');
        try {
          await subscriber.unsubscribe(channel);
          await subscriber.quit();
        } catch { /* ignore */ }
      });
    } else {
      socket.on('close', () => {
        app.log.info({ userId }, 'ws disconnected (no redis)');
      });
    }

    socket.on('message', (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch { /* ignore */ }
    });
  });
};

export default wsRoutes;
