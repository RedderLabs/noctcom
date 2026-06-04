import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Política de Cookies · Noctcom',
  description: 'Noctcom no usa cookies de rastreo. Solo cookies estrictamente necesarias de seguridad.',
  alternates: { canonical: '/cookies' },
};

const UPDATED = '4 de junio de 2026';

export default function CookiesPage() {
  return (
    <LegalPage
      title="Política de Cookies"
      updated={UPDATED}
      intro={
        <p>
          Versión corta: <strong className="text-text-primary">no usamos cookies de rastreo</strong>, ni
          propias ni de terceros, ni analítica que te perfile. Aquí está el detalle completo, por
          transparencia.
        </p>
      }
    >
      <LegalSection title="1. Cookies estrictamente necesarias">
        <p>
          Las únicas cookies que se establecen son las de <strong className="text-text-primary">Cloudflare</strong>,
          nuestro proveedor de red, para proteger el servicio frente a ataques y tráfico malicioso:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-400">
          <li><code className="text-xs bg-bg-surface-2 px-1.5 py-0.5 rounded">__cf_bm</code> — distingue tráfico humano de bots (gestión de bots).</li>
          <li><code className="text-xs bg-bg-surface-2 px-1.5 py-0.5 rounded">cf_clearance</code> — recuerda que has superado una comprobación de seguridad.</li>
        </ul>
        <p>
          Son <strong className="text-text-primary">estrictamente necesarias</strong> para la seguridad
          del servicio, no recopilan datos personales con fines de marketing y, conforme a la normativa,
          no requieren consentimiento previo.
        </p>
      </LegalSection>

      <LegalSection title="2. Lo que NO usamos">
        <p>
          No usamos Google Analytics, Google Tag Manager, píxeles publicitarios ni cookies de rastreo
          de terceros. No construimos perfiles ni compartimos tu navegación con anunciantes. Si en el
          futuro incorporáramos analítica, sería <strong className="text-text-primary">respetuosa con la
          privacidad y sin cookies</strong>, y se reflejaría aquí.
        </p>
      </LegalSection>

      <LegalSection title="3. Almacenamiento local en tu navegador">
        <p>
          No son cookies, pero por transparencia: Noctcom usa el almacenamiento local de tu navegador
          para funcionar, y esos datos <strong className="text-text-primary">nunca salen de tu
          dispositivo</strong> ni se comparten:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-400">
          <li><strong className="text-text-primary">sessionStorage</strong>: el material criptográfico de tu sesión (claves en memoria). Se borra al cerrar la pestaña.</li>
          <li><strong className="text-text-primary">localStorage</strong>: preferencias como el identificador de dispositivo, si aceptaste este aviso o si activaste las notificaciones.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Cómo gestionarlas">
        <p>
          Puedes borrar o bloquear las cookies desde la configuración de tu navegador. Ten en cuenta que
          bloquear las cookies de seguridad de Cloudflare puede impedir el acceso al servicio.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
