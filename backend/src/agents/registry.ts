/**
 * Registro en memoria de agentes ("Noctcom Connector") conectados.
 *
 * Mapea agentId → socket WS autenticado, y ofrece envío de comandos con
 * correlación request/response (para M1+: list-disks, mount, write-chunk…).
 * El estado es por-proceso: si el backend escala a varias instancias habrá que
 * enrutar por una capa compartida (Redis), pero hoy corre en una sola.
 */

// Solo necesitamos esta forma estructural del socket de @fastify/websocket.
export interface AgentSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
}

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface AgentConn {
  socket: AgentSocket;
  userId: string;
  agentId: string;
  pending: Map<string, Pending>;
}

const connections = new Map<string, AgentConn>(); // agentId → conn

export function addConnection(agentId: string, userId: string, socket: AgentSocket): void {
  // Una sola conexión viva por agente: si llega otra, reemplaza a la anterior.
  const prev = connections.get(agentId);
  if (prev && prev.socket !== socket) {
    try { prev.socket.close(4000, 'replaced'); } catch { /* */ }
    for (const p of prev.pending.values()) { clearTimeout(p.timer); p.reject(new Error('replaced')); }
  }
  connections.set(agentId, { socket, userId, agentId, pending: new Map() });
}

export function removeConnection(agentId: string, socket: AgentSocket): void {
  const conn = connections.get(agentId);
  if (conn && conn.socket === socket) {
    for (const p of conn.pending.values()) { clearTimeout(p.timer); p.reject(new Error('agent disconnected')); }
    connections.delete(agentId);
  }
}

export function disconnect(agentId: string, reason: string): void {
  const conn = connections.get(agentId);
  if (!conn) return;
  try { conn.socket.close(4001, reason); } catch { /* */ }
  removeConnection(agentId, conn.socket);
}

export function isOnline(agentId: string): boolean {
  return connections.has(agentId);
}

/** IDs de agentes online pertenecientes a un usuario. */
export function onlineAgentIds(userId: string): Set<string> {
  const s = new Set<string>();
  for (const c of connections.values()) if (c.userId === userId) s.add(c.agentId);
  return s;
}

// ─── Comandos correlacionados (M1+) ──────────────────────────────
let seq = 0;

/** Envía un comando al agente y resuelve con su respuesta (o rechaza por timeout/offline). */
export function sendCommand(
  agentId: string,
  cmd: string,
  args: unknown,
  timeoutMs = 30_000,
): Promise<unknown> {
  const conn = connections.get(agentId);
  if (!conn) return Promise.reject(new Error('agent offline'));
  const id = `c${++seq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.pending.delete(id);
      reject(new Error('agent command timeout'));
    }, timeoutMs);
    conn.pending.set(id, { resolve, reject, timer });
    try {
      conn.socket.send(JSON.stringify({ id, type: 'cmd', cmd, args }));
    } catch (err) {
      conn.pending.delete(id);
      clearTimeout(timer);
      reject(err as Error);
    }
  });
}

/** Llamado por el handler WS cuando el agente devuelve una respuesta correlacionada. */
export function resolveResponse(
  agentId: string,
  id: string,
  ok: boolean,
  data: unknown,
  error?: string,
): void {
  const conn = connections.get(agentId);
  const p = conn?.pending.get(id);
  if (!conn || !p) return;
  clearTimeout(p.timer);
  conn.pending.delete(id);
  if (ok) p.resolve(data);
  else p.reject(new Error(error ?? 'agent error'));
}

/** Solo para tests: limpia el estado global. */
export function _reset(): void {
  for (const c of connections.values()) {
    for (const p of c.pending.values()) clearTimeout(p.timer);
  }
  connections.clear();
  seq = 0;
}
