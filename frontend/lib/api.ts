/**
 * Cliente API tipado para Noctcom.
 * Maneja JWT, refresh automático y serialización base64url.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type FetchOptions = RequestInit & { skipAuth?: boolean };

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
  if (typeof window !== 'undefined') {
    if (access) localStorage.setItem('noctcom.access', access);
    else localStorage.removeItem('noctcom.access');
    if (refresh) localStorage.setItem('noctcom.refresh', refresh);
    else localStorage.removeItem('noctcom.refresh');
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function loadTokens(): { access: string | null; refresh: string | null } {
  if (typeof window === 'undefined') return { access: null, refresh: null };
  accessToken = localStorage.getItem('noctcom.access');
  refreshToken = localStorage.getItem('noctcom.refresh');
  return { access: accessToken, refresh: refreshToken };
}

async function refreshAccess(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  setTokens(data.accessToken, refreshToken);
  return true;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const baseHeaders: Record<string, string> = {
    // Solo declaramos JSON si hay cuerpo: Fastify 5 rechaza un body vacío con
    // content-type application/json, y eso rompía DELETE (papelera) y PATCH
    // (estrella), que no envían body.
    ...(rest.body != null ? { 'content-type': 'application/json' } : {}),
    ...(headers as Record<string, string>),
  };
  if (!skipAuth && accessToken) baseHeaders.authorization = `Bearer ${accessToken}`;

  let res = await fetch(`${API_URL}${path}`, { ...rest, headers: baseHeaders });

  if (res.status === 401 && !skipAuth && refreshToken) {
    const refreshed = await refreshAccess();
    if (refreshed) {
      baseHeaders.authorization = `Bearer ${accessToken}`;
      res = await fetch(`${API_URL}${path}`, { ...rest, headers: baseHeaders });
    }
  }

  if (!res.ok) {
    const text = await res.text();
    let detail: any = text;
    try { detail = JSON.parse(text); } catch { /* */ }
    throw new ApiError(res.status, detail?.message || detail?.error || res.statusText, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail: any) {
    super(message);
  }
}

// ─── PUT directo a presigned URL (sin headers de auth) ──────────
export async function uploadToPresignedUrl(
  url: string,
  body: BodyInit,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (onProgress && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`upload failed: ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('network error during upload'));
      xhr.send(body as XMLHttpRequestBodyInit);
    });
  }
  const res = await fetch(url, { method: 'PUT', body });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}
