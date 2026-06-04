import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Wrappers de navegación conscientes del idioma. Usar SIEMPRE estos en vez de
// next/link y next/navigation: prefijan el locale automáticamente (p. ej. un
// usuario en /en que pulse un Link a /precios va a /en/precios, no a /precios).
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
