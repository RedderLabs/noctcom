import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Política de Privacidad · Noctcom',
  description: 'Cómo Noctcom trata (y sobre todo, cómo NO puede tratar) tus datos. Zero-knowledge y RGPD.',
  alternates: { canonical: '/privacidad' },
};

const UPDATED = '4 de junio de 2026';

export default function PrivacidadPage() {
  return (
    <LegalPage
      title="Política de Privacidad"
      updated={UPDATED}
      intro={
        <p>
          La privacidad no es una sección en Noctcom: es la arquitectura. El servidor está construido
          para <strong className="text-text-primary">no poder</strong> leer tu contenido. Esta política
          explica qué datos tratamos, por qué, durante cuánto tiempo y qué derechos tienes (RGPD).
        </p>
      }
    >
      <LegalSection title="1. Responsable del tratamiento">
        <p>
          <strong className="text-text-primary">Julián Rodríguez</strong> (marca «Redder Labs»),
          responsable del servicio Noctcom. Para cualquier asunto de privacidad o para ejercer tus
          derechos: <a href="mailto:hello@noctcom.com" className="text-violet-300 hover:text-violet-200">hello@noctcom.com</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. El principio zero-knowledge">
        <p>
          Tus archivos se cifran en tu dispositivo con claves derivadas de tu contraseña, que nunca sale
          de él. Lo que llega a nuestros servidores es <strong className="text-text-primary">texto
          cifrado que no podemos descifrar</strong>: ni el contenido, ni los nombres de archivo, ni los
          metadatos. No es una promesa de «no mirar»: es una imposibilidad técnica, verificable en el
          código abierto (AGPL-3.0).
        </p>
      </LegalSection>

      <LegalSection title="3. Qué datos tratamos">
        <p>Tratamos el mínimo imprescindible para que el servicio funcione:</p>
        <ul className="list-disc pl-5 space-y-2 marker:text-violet-400">
          <li>
            <strong className="text-text-primary">Hash del correo electrónico</strong> (BLAKE2b). No
            almacenamos tu email en claro. Cuando necesitamos enviarte un correo (verificación, código
            de acceso, recuperación), tu cliente nos envía el email solo para esa entrega y se transmite
            a nuestro proveedor de email; no se guarda en nuestra base de datos.
          </li>
          <li><strong className="text-text-primary">Nombre de usuario</strong> que tú eliges (puede ser un seudónimo).</li>
          <li>
            <strong className="text-text-primary">Contenido cifrado</strong>: blobs de archivos, nombres
            y metadatos, todos cifrados de extremo a extremo. Para nosotros son bytes opacos.
          </li>
          <li>
            <strong className="text-text-primary">Datos técnicos de seguridad</strong>: registros de
            sesión y de intentos de acceso con la dirección IP <strong className="text-text-primary">hasheada</strong>{' '}
            (no en claro), para prevenir abuso y fuerza bruta.
          </li>
          <li>
            <strong className="text-text-primary">Información de dispositivo</strong> (p. ej. el
            navegador), almacenada cifrada para que reconozcas tus sesiones.
          </li>
          <li>
            <strong className="text-text-primary">Informes de error</strong>: ante un fallo de la
            aplicación, se registra el error técnico (traza, navegador) para poder corregirlo; puede
            incluir la dirección IP de la petición. No incluye tu contenido.
          </li>
        </ul>
        <p>
          <strong className="text-text-primary">No</strong> creamos perfiles publicitarios, no vendemos
          datos y no usamos cookies de rastreo (ver la <a href="/cookies" className="text-violet-300 hover:text-violet-200">Política de Cookies</a>).
        </p>
      </LegalSection>

      <LegalSection title="4. Para qué y con qué base legal">
        <ul className="list-disc pl-5 space-y-2 marker:text-violet-400">
          <li><strong className="text-text-primary">Prestar el servicio</strong> (cuenta, almacenamiento, sincronización): ejecución del contrato (art. 6.1.b RGPD).</li>
          <li><strong className="text-text-primary">Seguridad y prevención de abuso</strong> (hashes de IP, límites, registros): interés legítimo (art. 6.1.f).</li>
          <li><strong className="text-text-primary">Corrección de errores</strong> (informes técnicos): interés legítimo (art. 6.1.f), minimizando datos.</li>
          <li><strong className="text-text-primary">Comunicaciones de servicio</strong> (verificación, códigos, avisos): ejecución del contrato.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Encargados y transferencias internacionales">
        <p>
          Para operar, usamos proveedores que actúan como encargados del tratamiento. Solo manejan datos
          cifrados o el mínimo necesario:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-400">
          <li><strong className="text-text-primary">Render</strong> — alojamiento de la aplicación.</li>
          <li><strong className="text-text-primary">Neon</strong> — base de datos (metadatos cifrados y hashes).</li>
          <li><strong className="text-text-primary">Backblaze B2</strong> — almacenamiento de los blobs cifrados.</li>
          <li><strong className="text-text-primary">Resend</strong> — envío de correos (recibe tu email solo para entregar el mensaje).</li>
          <li><strong className="text-text-primary">Google / Firebase</strong> — notificaciones push (si las activas).</li>
          <li><strong className="text-text-primary">GlitchTip</strong> — registro de errores de la aplicación.</li>
          <li><strong className="text-text-primary">Cloudflare</strong> — red de distribución y protección frente a ataques.</li>
        </ul>
        <p>
          Algunos proveedores pueden tratar datos fuera del Espacio Económico Europeo (p. ej. EE. UU.).
          En esos casos, las transferencias se amparan en las garantías previstas por el RGPD (cláusulas
          contractuales tipo o marcos de adecuación vigentes). Dado el diseño zero-knowledge, lo que estos
          proveedores almacenan es, en su mayor parte, cifrado e ilegible para ellos.
        </p>
      </LegalSection>

      <LegalSection title="6. Cuánto tiempo conservamos los datos">
        <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-400">
          <li><strong className="text-text-primary">Cuenta y contenido cifrado</strong>: mientras tu cuenta exista. Al borrarla, se eliminan.</li>
          <li><strong className="text-text-primary">Registros de intentos de acceso</strong>: se purgan automáticamente a los 30 días.</li>
          <li><strong className="text-text-primary">Sesiones</strong>: hasta su expiración o revocación.</li>
          <li><strong className="text-text-primary">Copias de seguridad</strong>: se conservan durante una ventana limitada y rotan; el contenido sigue cifrado.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Tus derechos (RGPD)">
        <p>Puedes ejercer en cualquier momento tus derechos de:</p>
        <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-400">
          <li><strong className="text-text-primary">Acceso</strong> y <strong className="text-text-primary">rectificación</strong>.</li>
          <li><strong className="text-text-primary">Supresión</strong>: puedes borrar tu cuenta y datos desde los ajustes.</li>
          <li><strong className="text-text-primary">Portabilidad</strong>: exporta tu bóveda completa cuando quieras.</li>
          <li><strong className="text-text-primary">Oposición</strong> y <strong className="text-text-primary">limitación</strong> del tratamiento.</li>
        </ul>
        <p>
          Para ejercerlos, escríbenos a <a href="mailto:hello@noctcom.com" className="text-violet-300 hover:text-violet-200">hello@noctcom.com</a>.
          También tienes derecho a reclamar ante la autoridad de control competente (en España, la{' '}
          <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:text-violet-200">Agencia Española de Protección de Datos</a>).
        </p>
        <p className="text-text-tertiary text-xs">
          Nota: por el cifrado zero-knowledge, no podemos acceder al contenido de tu cuenta para
          atender una solicitud sobre archivos concretos; tú mantienes ese acceso con tus claves.
        </p>
      </LegalSection>

      <LegalSection title="8. Menores">
        <p>
          Noctcom no está dirigido a menores de 14 años. Si crees que un menor nos ha facilitado datos
          sin el consentimiento adecuado, contáctanos y lo resolveremos.
        </p>
      </LegalSection>

      <LegalSection title="9. Cambios en esta política">
        <p>
          Podemos actualizar esta política. Los cambios sustanciales se comunicarán por los medios
          disponibles. La fecha de «última revisión» de arriba indica la versión vigente.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
