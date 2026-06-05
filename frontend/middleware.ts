import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Aplica el routing de idioma a todo MENOS: rutas de API, internos de Next,
  // cualquier fichero con extensión (logo.svg, robots.txt, sitemap.xml, etc.)
  // y las imágenes OG. Sin la exclusión, el middleware respondía 307 a
  // /es/opengraph-image (quita el prefijo del idioma por defecto) y los bots
  // de WhatsApp/Telegram/X no siguen redirects para og:image → sin preview.
  matcher: ['/((?!api|_next|_vercel|.*\\..*|.*opengraph-image.*).*)'],
};
