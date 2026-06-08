'use client';

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { rt } from './i18n-runtime';
import { useAuth } from './auth-store';
import { useVault } from './vault-store';
import { loadTokens, setTokens } from './api';
import { flushQueuedUploads } from './offline-queue';

const WS_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
  .replace('http', 'ws');

const RECONNECT_DELAY = 3000;
const BROADCAST_CHANNEL = 'noctcom-sync';

export function useSync() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const bcRef = useRef<BroadcastChannel | null>(null);
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const { loadNodes, parentId, refreshStorage, initialized } = useVault();

  const logout = useAuth((s) => s.logout);
  const deviceId = useAuth((s) => s.deviceId);

  const handleChange = useCallback((event: { resource: string; action: string }) => {
    if (event.resource === 'devices') {
      if (event.action === 'new') {
        toast.info(rt('toasts.newDevice'));
      }
      if (event.action === 'revoked') {
        const storedId = typeof window !== 'undefined' ? localStorage.getItem('noctcom.deviceId') : null;
        if (storedId && storedId === deviceId) {
          toast.error(rt('toasts.deviceRevoked'));
          setTokens(null, null);
          logout();
        }
      }
      return;
    }

    if (event.resource === 'contacts') {
      if (event.action === 'requested') toast.info(rt('toasts.newContactRequest'));
      useVault.getState().refreshContactCount();
      return;
    }

    if (!initialized) return;
    if (event.resource === 'nodes') {
      loadNodes(parentId);
    }
    if (event.resource === 'storage') {
      refreshStorage();
    }
  }, [initialized, loadNodes, parentId, refreshStorage, deviceId, logout]);

  const connect = useCallback(() => {
    const { access } = loadTokens();
    if (!access || wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/api/v1/ws/sync?token=${access}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'change') {
          handleChange(msg);
          bcRef.current?.postMessage(msg);
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (isAuthenticated) {
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };

    ws.onerror = () => ws.close();
  }, [isAuthenticated, handleChange]);

  // ── Offline→online (Fase 11 · PWA) ────────────────────────────
  // Al perder la red: aviso. Al recuperarla: reconectar el WS sin esperar el
  // retry, refrescar nodos+cuota (lo ocurrido en otros dispositivos mientras
  // tanto) y vaciar la cola de subidas hechas sin conexión (offline-queue).
  const resyncOnline = useCallback(async () => {
    toast.info(rt('toasts.backOnline'));
    connect();
    const { initialized: ready, loadNodes: load, parentId: pid, refreshStorage: refresh } = useVault.getState();
    if (ready) {
      load(pid);
      refresh();
    }
    const sent = await flushQueuedUploads();
    if (sent > 0) {
      toast.success(rt('toasts.offlineUploadsSynced', { count: sent }));
      const v = useVault.getState();
      if (v.initialized) {
        v.loadNodes(v.parentId);
        v.refreshStorage();
      }
    }
  }, [connect]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onOffline = () => toast.warning(rt('toasts.offline'));
    window.addEventListener('online', resyncOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', resyncOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [isAuthenticated, resyncOnline]);

  // Cola pendiente de una sesión anterior (la app se cerró sin red): se vacía
  // al abrir sesión con conexión.
  useEffect(() => {
    if (!isAuthenticated || !initialized || !navigator.onLine) return;
    flushQueuedUploads().then((sent) => {
      if (sent > 0) {
        toast.success(rt('toasts.offlineUploadsSynced', { count: sent }));
        const v = useVault.getState();
        v.loadNodes(v.parentId);
        v.refreshStorage();
      }
    });
  }, [isAuthenticated, initialized]);

  useEffect(() => {
    if (!isAuthenticated) {
      wsRef.current?.close();
      return;
    }

    connect();

    // BroadcastChannel for cross-tab sync
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(BROADCAST_CHANNEL);
      bcRef.current = bc;
      bc.onmessage = (e) => {
        if (e.data?.type === 'change') {
          handleChange(e.data);
        }
      };
    }

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      bcRef.current?.close();
    };
  }, [isAuthenticated, connect, handleChange]);
}
