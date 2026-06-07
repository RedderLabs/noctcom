'use client';

import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, deleteToken, onMessage, type Messaging } from 'firebase/messaging';
import { apiFetch } from './api';

// Config web de Firebase: PÚBLICA por diseño (identifica el proyecto, no
// autentica nada — la seguridad real está en el service account del backend).
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

let messaging: Messaging | null = null;

function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (messaging) return messaging;
  if (!firebaseConfig.apiKey) return null; // build sin config de Firebase

  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
  try {
    messaging = getMessaging(app);
    return messaging;
  } catch {
    return null;
  }
}

export type PushStatus = 'unsupported' | 'default' | 'granted' | 'denied';

// getToken() acuña un token nuevo si no hay — el permiso del navegador por sí
// solo no dice si el usuario QUIERE notificaciones. Este flag guarda su
// elección explícita en Ajustes (por navegador, que es el ámbito del token).
const ENABLED_KEY = 'noctcom.pushEnabled';

/** Elección del usuario en Ajustes (true solo tras activar explícitamente). */
export function isPushChosen(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ENABLED_KEY) === 'true';
}

/** Estado actual del permiso de notificaciones en este navegador. */
export function getPushStatus(): PushStatus {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  if (!getFirebaseMessaging()) return 'unsupported';
  return Notification.permission as PushStatus;
}

// Obtiene el token FCM. LANZA con la causa real si falla (SW no registrable,
// VAPID inválida, push service caído…) — un fallo aquí NUNCA debe parecer
// éxito: antes se tragaba el error y Ajustes decía "activado" sin registrar
// nada en push_tokens.
async function fetchToken(): Promise<string> {
  const m = getFirebaseMessaging();
  if (!m) throw new Error('Firebase Messaging no está disponible en este navegador');
  // El SW unificado (app-shell + push) — un scope solo admite un SW; el de
  // FCM se carga dentro de sw.js vía importScripts (ver public/sw.js).
  const swReg = await navigator.serviceWorker.register('/sw.js');
  let token: string;
  try {
    token = await getToken(m, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
  } catch (err: any) {
    // "AbortError: Registration failed - push service error" = el push service
    // del NAVEGADOR rechazó la suscripción (no llega ni a Firebase). Caso real
    // verificado: Brave lo desactiva por defecto. También: forks sin servicios
    // de Google, firewalls que bloquean mtalk.google.com, políticas de empresa.
    if (err?.name === 'AbortError' || /push service error/i.test(String(err?.message ?? ''))) {
      throw new Error(
        'Tu navegador tiene bloqueado el servicio de push. En Brave: Ajustes → ' +
        'Privacidad → activa «Usar servicios de Google para la mensajería push» ' +
        'y reinicia el navegador. Si usas un firewall, permite mtalk.google.com.',
      );
    }
    throw err;
  }
  if (!token) throw new Error('FCM no devolvió token (¿permiso revocado a mitad?)');
  return token;
}

/**
 * Sincronización PASIVA: si el usuario ya concedió el permiso en una sesión
 * anterior, refresca y registra el token (FCM los rota). NUNCA muestra el
 * diálogo de permiso — eso solo pasa con gesto explícito (enablePush, en
 * Ajustes). Llamada desde el layout del vault en cada sesión.
 */
export async function syncPushToken(): Promise<void> {
  try {
    if (!isPushChosen() || getPushStatus() !== 'granted') return;
    const token = await fetchToken();
    await apiFetch('/api/v1/push/register', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    // Pasivo: no molestar al usuario, pero dejar rastro para depurar.
    console.warn('[push] sync falló:', err);
  }
}

/**
 * Activación EXPLÍCITA desde Ajustes: pide el permiso al navegador y registra
 * el token. Devuelve el estado resultante.
 */
export async function enablePush(): Promise<PushStatus> {
  const status = getPushStatus();
  if (status === 'unsupported' || status === 'denied') return status;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission as PushStatus;

  // Si fetchToken o el registro fallan, LANZAN: el flag solo se pone (y la UI
  // solo dice "activado") cuando el token está de verdad en push_tokens.
  const token = await fetchToken();
  await apiFetch('/api/v1/push/register', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  localStorage.setItem(ENABLED_KEY, 'true');
  return 'granted';
}

/**
 * Desactivación: borra el token de FCM (este navegador deja de poder recibir)
 * y lo da de baja en el servidor. El permiso del navegador queda concedido,
 * pero sin token no llega nada.
 */
export async function disablePush(): Promise<void> {
  localStorage.setItem(ENABLED_KEY, 'false');
  const m = getFirebaseMessaging();
  if (!m) return;
  try {
    const token = await fetchToken();
    await apiFetch('/api/v1/push/unregister', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    }).catch(() => {});
  } catch { /* sin token que dar de baja */ }
  await deleteToken(m).catch(() => {});
}

export function onForegroundMessage(callback: (payload: any) => void) {
  const m = getFirebaseMessaging();
  if (!m) return () => {};
  return onMessage(m, callback);
}
