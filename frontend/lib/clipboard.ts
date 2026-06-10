'use client';

/**
 * Copia texto al portapapeles funcionando también en contexto INSEGURO
 * (self-host LAN por HTTP plano, donde `navigator.clipboard` es `undefined`
 * porque la Clipboard API exige HTTPS o localhost). Usa la Clipboard API si
 * está disponible; si no, cae al método legacy (textarea oculto + execCommand).
 *
 * Devuelve `true` si el texto se copió. Nunca lanza: así un onClick que lo use
 * no se rompe en HTTP (antes `navigator.clipboard.writeText(...)` reventaba).
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permiso denegado o contexto inseguro → probamos el método legacy.
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // Fuera de la vista y sin desplazar la página al hacer focus.
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Borra el portapapeles (best-effort) tras mostrar un secreto, p. ej. la frase
 * de recuperación. Ignora errores y el contexto inseguro.
 */
export function clearClipboard(): void {
  void copyText('');
}
