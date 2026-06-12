import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea bytes a una cifra legible (B/KB/MB/GB/TB), base 1024. Una cifra
 * decimal por debajo de 10 unidades. Canónica para el panel self-host (cuotas
 * de disco, tamaños de archivo). Usar coma decimal vía `locale` si hace falta.
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Strip HTML/script tags and dangerous chars to prevent XSS via input fields.
 * Only allows alphanumeric, common punctuation, and unicode letters.
 */
export function sanitizeInput(value: string): string {
  return value
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:/gi, '')
    .trim();
}

export function sanitizeUsername(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64);
}

export function sanitizeEmail(value: string): string {
  return value.replace(/[<>"';&|`$(){}[\]\\]/g, '').slice(0, 254).trim();
}

export function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes('SQL') || msg.includes('ECONNREFUSED') || msg.includes('timeout')) {
      return 'Error del servidor. Inténtalo más tarde.';
    }
    if (msg.length > 200) return 'Error inesperado. Inténtalo más tarde.';
    return sanitizeInput(msg);
  }
  return 'Error inesperado. Inténtalo más tarde.';
}
