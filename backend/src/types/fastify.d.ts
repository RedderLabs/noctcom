import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // scope: tokens de propósito limitado (pending-2fa, step-up). Su ausencia
    // (undefined) identifica un access token normal de sesión.
    payload: { sub: string; deviceId: string | null; scope?: string };
    user: { sub: string; deviceId: string | null; scope?: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

