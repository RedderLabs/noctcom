'use client';

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from './auth-store';
import { useVault } from './vault-store';
import { loadTokens, setTokens } from './api';

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
        toast.info('Nuevo dispositivo conectado a tu cuenta');
      }
      if (event.action === 'revoked') {
        const storedId = typeof window !== 'undefined' ? localStorage.getItem('noctcom.deviceId') : null;
        if (storedId && storedId === deviceId) {
          toast.error('Este dispositivo ha sido revocado');
          setTokens(null, null);
          logout();
        }
      }
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
