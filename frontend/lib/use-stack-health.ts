'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api';

export type ServiceStatus = 'ok' | 'down';

export interface StackService {
  service: string;
  status: ServiceStatus;
}

// Servicios del stack LXC en el orden en que se muestran en los chips. Si el
// endpoint falla (red caída, sesión expirada) los marcamos 'down' en vez de
// inventar 'ok' — honestidad: un chip verde debe significar comprobado.
const FALLBACK: StackService[] = [
  { service: 'postgres', status: 'down' },
  { service: 'redis', status: 'down' },
  { service: 'minio', status: 'down' },
  { service: 'backend', status: 'down' },
  { service: 'caddy', status: 'down' },
];

/**
 * Sondea GET /api/v1/storage/stack-health cada `intervalMs` (15 s por defecto).
 * Solo tiene sentido en self-host (el panel operativo); en la nube no se monta.
 */
export function useStackHealth(intervalMs = 15_000): {
  services: StackService[];
  loading: boolean;
} {
  const [services, setServices] = useState<StackService[]>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      try {
        const data = await apiFetch<StackService[]>('/api/v1/storage/stack-health');
        if (alive && Array.isArray(data)) setServices(data);
      } catch {
        if (alive) setServices(FALLBACK);
      } finally {
        if (alive) setLoading(false);
      }
    };

    poll();
    const id = setInterval(poll, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);

  return { services, loading };
}
