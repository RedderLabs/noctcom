/**
 * WebSocket de sincronización.
 * El servidor solo envía notificaciones de "algo cambió" — nunca el contenido.
 * Cliente reacciona pidiendo la nueva metadata cifrada por HTTP.
 */

import type { FastifyPluginAsync } from 'fastify';

const wsRoutes: FastifyPluginAsync = async (app) => {

  app.get('/sync', { websocket: true }, (socket, req) => {
    // Autenticación por query param ?token=
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

    // Suscribe a Redis pub/sub canal `user:${userId}` para notificar cambios
    // (implementación detallada queda fuera de este MVP inicial).

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch { /* ignore */ }
    });

    socket.on('close', () => {
      app.log.info({ userId }, 'ws disconnected');
    });
  });
};

export default wsRoutes;
