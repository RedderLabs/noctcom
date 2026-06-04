import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Términos de Servicio · Noctcom',
  description: 'Términos y condiciones de uso de Noctcom, almacenamiento cifrado zero-knowledge.',
  alternates: { canonical: '/terminos' },
};

const UPDATED = '4 de junio de 2026';

export default function TerminosPage() {
  return (
    <LegalPage
      title="Términos de Servicio"
      updated={UPDATED}
      intro={
        <p>
          Estos términos regulan el uso de Noctcom. Al crear una cuenta o usar el servicio,
          aceptas lo que aquí se describe. Están escritos para entenderse: si algo no te encaja,
          escríbenos a <a href="mailto:hello@noctcom.com" className="text-violet-300 hover:text-violet-200">hello@noctcom.com</a>.
        </p>
      }
    >
      <LegalSection title="1. Quién presta el servicio">
        <p>
          Noctcom es un servicio de almacenamiento cifrado <strong className="text-text-primary">zero-knowledge</strong>{' '}
          operado por <strong className="text-text-primary">Redder Labs</strong>, proyecto de desarrollo
          independiente (en adelante, «nosotros»). Contacto: <a href="mailto:hello@noctcom.com" className="text-violet-300 hover:text-violet-200">hello@noctcom.com</a>.
        </p>
        <p>
          El software de Noctcom es de código abierto bajo licencia <strong className="text-text-primary">AGPL-3.0</strong>.
          Puedes auditarlo, modificarlo y auto-alojarlo (self-host) según esa licencia. Estos términos
          regulan el <em>servicio gestionado</em> que ofrecemos en noctcom.com; el auto-alojamiento se
          rige por la AGPL-3.0, no por este documento.
        </p>
      </LegalSection>

      <LegalSection title="2. Qué es (y qué no es) Noctcom">
        <p>
          Noctcom cifra tus archivos en tu dispositivo <strong className="text-text-primary">antes</strong>{' '}
          de subirlos. Nuestros servidores solo almacenan datos cifrados que no podemos descifrar. No
          tenemos acceso al contenido, a los nombres de tus archivos ni a tus claves.
        </p>
        <p>
          Noctcom es un servicio de almacenamiento, no una suite de ofimática ni una herramienta de
          comunicación en tiempo real. No analizamos, indexamos ni monetizamos tu contenido — entre
          otras razones porque, por diseño, <strong className="text-text-primary">no podemos</strong>.
        </p>
      </LegalSection>

      <LegalSection title="3. Tu cuenta, tu contraseña y tu frase de recuperación">
        <p>
          La seguridad de tu cuenta depende de tu <strong className="text-text-primary">contraseña maestra</strong>{' '}
          y tu <strong className="text-text-primary">frase de recuperación</strong> de 12 palabras. Eres
          responsable de custodiarlas.
        </p>
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-text-secondary">
          <strong className="text-amber-200">Advertencia crítica:</strong> por la naturaleza
          zero-knowledge del servicio, <strong className="text-text-primary">si pierdes tu contraseña
          y tu frase de recuperación, tus datos son irrecuperables</strong>. No existe puerta trasera,
          restablecimiento por soporte ni copia de tus claves en nuestro poder. Asegúrate de guardar tu
          frase de recuperación en un lugar seguro.
        </p>
      </LegalSection>

      <LegalSection title="4. Uso aceptable">
        <p>
          Te comprometes a no usar Noctcom para almacenar o distribuir contenido ilícito, ni para
          actividades que infrinjan la ley o derechos de terceros. Como no podemos ver tu contenido, la
          responsabilidad sobre lo que almacenas recae <strong className="text-text-primary">íntegramente
          en ti</strong>.
        </p>
        <p>
          No monitorizamos el contenido (no podemos), pero sí podemos actuar ante notificaciones legales
          válidas o señales de abuso del servicio (p. ej. uso automatizado para saturar la
          infraestructura), suspendiendo cuentas cuando proceda.
        </p>
      </LegalSection>

      <LegalSection title="5. Tus archivos son tuyos">
        <p>
          Conservas todos los derechos sobre el contenido que subes. No adquirimos ninguna titularidad
          ni licencia sobre tus archivos más allá del almacenamiento técnico (cifrado) necesario para
          prestarte el servicio. Puedes exportar tu bóveda completa en cualquier momento.
        </p>
      </LegalSection>

      <LegalSection title="6. Planes y precios">
        <p>
          El servicio gestionado incluye una cuota gratuita inicial. Los planes de pago, cuando se
          activen, cobran exclusivamente por <strong className="text-text-primary">capacidad de
          almacenamiento</strong> (bytes), nunca por tu contenido. El <strong className="text-text-primary">self-host
          es y será siempre gratuito</strong> bajo AGPL-3.0. Cualquier cambio de precios se comunicará con
          antelación razonable.
        </p>
      </LegalSection>

      <LegalSection title="7. Disponibilidad y «tal cual»">
        <p>
          Noctcom se ofrece «<strong className="text-text-primary">tal cual</strong>» y «según
          disponibilidad». Trabajamos para mantener el servicio operativo, pero no garantizamos un
          tiempo de actividad ininterrumpido. Puede haber mantenimientos, interrupciones o cambios. En
          fase temprana, recomendamos mantener copias propias de los datos críticos.
        </p>
      </LegalSection>

      <LegalSection title="8. Limitación de responsabilidad">
        <p>
          En la máxima medida permitida por la ley, no seremos responsables de la pérdida de datos
          derivada de la pérdida de tus claves (contraseña/frase), ni de daños indirectos o
          consecuentes. Dado el diseño zero-knowledge, <strong className="text-text-primary">no podemos
          recuperar datos cifrados sin tus claves</strong>, y aceptas ese riesgo al usar el servicio.
        </p>
      </LegalSection>

      <LegalSection title="9. Cancelación">
        <p>
          Puedes borrar tu cuenta y tus datos en cualquier momento desde los ajustes. Podemos suspender
          o cerrar cuentas que incumplan estos términos o supongan un riesgo para el servicio o terceros.
        </p>
      </LegalSection>

      <LegalSection title="10. Cambios en los términos">
        <p>
          Podemos actualizar estos términos. Si los cambios son sustanciales, lo comunicaremos por los
          medios disponibles (p. ej. aviso en la app o email de servicio). El uso continuado tras la
          entrada en vigor implica su aceptación.
        </p>
      </LegalSection>

      <LegalSection title="11. Ley aplicable">
        <p>
          Estos términos se rigen por la legislación española y de la Unión Europea. El tratamiento de
          datos personales se detalla en la <a href="/privacidad" className="text-violet-300 hover:text-violet-200">Política de Privacidad</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
