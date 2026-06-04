import { createTransport, type Transporter } from 'nodemailer';
import { env } from './config.js';

let transporter: Transporter | null = null;
let resendApiKey: string | null = null;
let fromAddress: string;

export function initMail() {
  fromAddress = env.SMTP_FROM;
  resendApiKey = env.RESEND_API_KEY ?? null;

  if (!resendApiKey && env.SMTP_HOST) {
    transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
}

async function sendEmail(to: string, subject: string, text: string, html: string) {
  if (resendApiKey) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Noctcom <${fromAddress}>`,
        to: [to],
        subject,
        text,
        html,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Resend error ${resp.status}: ${body}`);
    }
    return;
  }

  if (transporter) {
    await transporter.sendMail({
      from: `"Noctcom" <${fromAddress}>`,
      to,
      subject,
      text,
      html,
    });
    return;
  }

  console.warn('No email provider configured, skipping email to', to);
}

// ─── Plantilla base ───────────────────────────────────────
// Email HTML compatible con la mayoría de clientes (tablas + estilos inline).
// Paleta Noctcom: fondo nocturno, acentos violeta.

interface EmailLayoutOptions {
  preheader: string; // texto de previsualización (oculto en el cuerpo)
  title: string;
  intro: string;
  code: string;
  caption: string; // leyenda bajo el código (p. ej. caducidad)
  button?: { label: string; url: string };
  footer: string;
}

function renderEmail(opts: EmailLayoutOptions): string {
  const base = env.FRONTEND_URL ?? env.PUBLIC_URL;
  const logoUrl = `${base}/logo.png`;
  const year = new Date().getFullYear();

  const button = opts.button
    ? `
              <tr>
                <td align="center" style="padding: 4px 0 8px;">
                  <a href="${opts.button.url}" style="display: inline-block; background: #7c3aed; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);">${opts.button.label}</a>
                </td>
              </tr>`
    : '';

  const codeChars = opts.code
    .split('')
    .map(
      (c) =>
        `<span style="display: inline-block; min-width: 16px; margin: 0 4px; font-size: 32px; line-height: 1; font-weight: 700; letter-spacing: 2px; color: #d2bbff;">${c}</span>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark light">
  <title>Noctcom</title>
</head>
<body style="margin: 0; padding: 0; background: #07070d; -webkit-font-smoothing: antialiased;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #07070d; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background: #0f0f17; border: 1px solid #1e1e2c; border-radius: 16px; overflow: hidden;">
          <!-- Barra de acento superior -->
          <tr>
            <td style="height: 4px; line-height: 4px; font-size: 0; background: #7c3aed; background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%);">&nbsp;</td>
          </tr>
          <!-- Cabecera (logo centrado) -->
          <tr>
            <td align="center" style="padding: 36px 40px 4px;">
              <img src="${logoUrl}" width="48" height="48" alt="Noctcom" style="display: block; border-radius: 12px; margin: 0 auto 12px;">
              <div style="font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; color: #ffffff;">Noctcom</div>
            </td>
          </tr>
          <!-- Cuerpo -->
          <tr>
            <td style="padding: 20px 40px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;">
                <tr>
                  <td align="center" style="font-size: 20px; font-weight: 600; color: #ededf3; padding: 0 0 8px;">${opts.title}</td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 15px; line-height: 1.6; color: #9a9ab2; padding: 0 0 24px;">${opts.intro}</td>
                </tr>
                <!-- Código -->
                <tr>
                  <td align="center" style="padding: 0 0 12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="background: #15151f; border: 1px solid #2a2a3d; border-radius: 12px;">
                      <tr>
                        <td align="center" style="padding: 22px 28px; font-family: 'SFMono-Regular', 'Consolas', monospace; white-space: nowrap;">${codeChars}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 12px; color: #6b6b85; padding: 0 0 28px;">${opts.caption}</td>
                </tr>
                ${button}
              </table>
            </td>
          </tr>
          <!-- Badge zero-knowledge -->
          <tr>
            <td align="center" style="padding: 12px 40px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="background: #14121f; border: 1px solid #2a2640; border-radius: 999px;">
                <tr>
                  <td style="padding: 7px 14px; font-family: 'SFMono-Regular', 'Consolas', monospace; font-size: 11px; color: #9a9ab2;">
                    <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #34d399; margin-right: 7px;">&nbsp;</span>Cifrado zero-knowledge de extremo a extremo
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Separador -->
          <tr>
            <td style="padding: 24px 40px 0;">
              <div style="border-top: 1px solid #1e1e2c;"></div>
            </td>
          </tr>
          <!-- Pie -->
          <tr>
            <td style="padding: 18px 40px 32px; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;">
              <p style="margin: 0 0 14px; font-size: 12px; line-height: 1.5; color: #6b6b85;">${opts.footer}</p>
              <p style="margin: 0 0 12px; font-size: 12px;">
                <a href="${base}/privacidad" style="color: #8e8ea8; text-decoration: none;">Privacidad</a>
                <span style="color: #3a3a4a;">&nbsp;·&nbsp;</span>
                <a href="${base}/terminos" style="color: #8e8ea8; text-decoration: none;">Términos</a>
                <span style="color: #3a3a4a;">&nbsp;·&nbsp;</span>
                <a href="mailto:hello@noctcom.com" style="color: #8e8ea8; text-decoration: none;">Soporte</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #4a4a5e;">© ${year} Noctcom · Redder Labs · tu nube privada cifrada</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Plantilla de aviso (sin código) — para facturación ───
// Misma estética que renderEmail pero con párrafos en vez de un código.
interface NoticeOptions {
  preheader: string;
  title: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  footer: string;
}

function renderNotice(opts: NoticeOptions): string {
  const base = env.FRONTEND_URL ?? env.PUBLIC_URL;
  const logoUrl = `${base}/logo.png`;
  const year = new Date().getFullYear();
  const button = opts.button
    ? `<tr><td align="center" style="padding: 8px 0 4px;"><a href="${opts.button.url}" style="display: inline-block; background: #7c3aed; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 10px;">${opts.button.label}</a></td></tr>`
    : '';
  const body = opts.paragraphs
    .map((p) => `<tr><td style="font-size: 15px; line-height: 1.6; color: #9a9ab2; padding: 0 0 16px;">${p}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark light"><title>Noctcom</title></head>
<body style="margin: 0; padding: 0; background: #07070d; -webkit-font-smoothing: antialiased;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #07070d; padding: 40px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background: #0f0f17; border: 1px solid #1e1e2c; border-radius: 16px; overflow: hidden;">
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: #7c3aed; background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%);">&nbsp;</td></tr>
      <tr><td align="center" style="padding: 36px 40px 4px;"><img src="${logoUrl}" width="48" height="48" alt="Noctcom" style="display: block; border-radius: 12px; margin: 0 auto 12px;"><div style="font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; color: #ffffff;">Noctcom</div></td></tr>
      <tr><td style="padding: 20px 40px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;">
        <tr><td style="font-size: 20px; font-weight: 600; color: #ededf3; padding: 0 0 16px;">${opts.title}</td></tr>
        ${body}
        ${button}
      </table></td></tr>
      <tr><td style="padding: 24px 40px 0;"><div style="border-top: 1px solid #1e1e2c;"></div></td></tr>
      <tr><td style="padding: 18px 40px 32px; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;">
        <p style="margin: 0 0 14px; font-size: 12px; line-height: 1.5; color: #6b6b85;">${opts.footer}</p>
        <p style="margin: 0 0 12px; font-size: 12px;"><a href="${base}/privacidad" style="color: #8e8ea8; text-decoration: none;">Privacidad</a><span style="color: #3a3a4a;">&nbsp;·&nbsp;</span><a href="${base}/terminos" style="color: #8e8ea8; text-decoration: none;">Términos</a><span style="color: #3a3a4a;">&nbsp;·&nbsp;</span><a href="mailto:hello@noctcom.com" style="color: #8e8ea8; text-decoration: none;">Soporte</a></p>
        <p style="margin: 0; font-size: 11px; color: #4a4a5e;">© ${year} Noctcom · Redder Labs · tu nube privada cifrada</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

// ─── Emails de ciclo de vida de la suscripción (P3) ───────
// El email lo aporta el llamador (lo lee de Stripe; no se almacena en Noctcom).

export async function sendPlanActiveEmail(to: string, planLabel: string, quotaLabel: string) {
  const url = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/vault`;
  await sendEmail(
    to,
    `Tu plan ${planLabel} está activo — Noctcom`,
    `Gracias por apoyar Noctcom. Tu cuenta ahora tiene ${quotaLabel} de almacenamiento cifrado.\n\n${url}`,
    renderNotice({
      preheader: `Tu plan ${planLabel} ya está activo (${quotaLabel}).`,
      title: `Tu plan ${planLabel} está activo`,
      paragraphs: [
        `Gracias por apoyar a Noctcom. Tu cuenta tiene ahora <strong style="color:#ededf3;">${quotaLabel}</strong> de almacenamiento con el mismo cifrado zero-knowledge de siempre.`,
        'Pagas por espacio, nunca por tus datos: tus archivos siguen siendo ilegibles para nosotros.',
      ],
      button: { label: 'Ir a mi bóveda', url },
      footer: 'Puedes cambiar o cancelar tu plan cuando quieras desde Ajustes → Plan y uso.',
    }),
  );
}

export async function sendPlanCanceledScheduledEmail(to: string, planLabel: string, revertDate: Date | null) {
  const url = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/vault/settings`;
  const fecha = fmtDate(revertDate);
  await sendEmail(
    to,
    'Cancelación programada — Noctcom',
    `Has cancelado tu plan ${planLabel}. Lo conservas hasta el ${fecha}; después tu cuenta vuelve al plan Gratuito (1 GB). No se borra nada.\n\n${url}`,
    renderNotice({
      preheader: `Conservas tu plan ${planLabel} hasta el ${fecha}.`,
      title: 'Cancelación programada',
      paragraphs: [
        `Has cancelado tu plan <strong style="color:#ededf3;">${planLabel}</strong>. Seguirás disfrutándolo${fecha ? ` hasta el <strong style="color:#ededf3;">${fecha}</strong>` : ' hasta el final del periodo ya pagado'}.`,
        'Después, tu cuenta volverá al plan <strong style="color:#ededf3;">Gratuito (1 GB)</strong>. No borramos nada: tus archivos siguen ahí. Si superas 1 GB, la cuenta quedará en solo lectura (podrás descargar y exportar) hasta que liberes espacio o reactives un plan.',
        'Si cambias de idea, puedes reactivar tu plan antes de esa fecha sin perder nada.',
      ],
      button: { label: 'Gestionar mi plan', url },
      footer: 'Recibes este aviso porque cancelaste una suscripción de Noctcom.',
    }),
  );
}

export async function sendPaymentFailedEmail(to: string, planLabel: string) {
  const url = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/vault/settings`;
  await sendEmail(
    to,
    'No pudimos cobrar tu plan — Noctcom',
    `Ha fallado el cobro de tu plan ${planLabel}. Actualiza tu método de pago para no perder tu espacio.\n\n${url}`,
    renderNotice({
      preheader: `Falló el cobro de tu plan ${planLabel}. Actualiza tu método de pago.`,
      title: 'No pudimos cobrar tu plan',
      paragraphs: [
        `Ha fallado el cobro de tu plan <strong style="color:#ededf3;">${planLabel}</strong>. Lo reintentaremos en los próximos días.`,
        'Para no perder tu espacio, revisa o actualiza tu método de pago. Tus archivos están a salvo: nada se borra por un pago fallido.',
      ],
      button: { label: 'Actualizar método de pago', url },
      footer: 'Si ya lo has solucionado, ignora este mensaje.',
    }),
  );
}

export async function sendPlanEndedEmail(to: string) {
  const url = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/vault/settings`;
  await sendEmail(
    to,
    'Tu plan ha vuelto a Gratuito — Noctcom',
    `Tu plan ha finalizado y tu cuenta vuelve al plan Gratuito (1 GB). Tus archivos siguen intactos.\n\n${url}`,
    renderNotice({
      preheader: 'Tu plan ha finalizado; tu cuenta vuelve al plan Gratuito (1 GB).',
      title: 'Tu plan ha vuelto a Gratuito',
      paragraphs: [
        'Tu plan ha finalizado y tu cuenta vuelve al <strong style="color:#ededf3;">plan Gratuito (1 GB)</strong>.',
        'Tus archivos siguen intactos. Si superas 1 GB, la cuenta queda en solo lectura (podrás descargar y exportar) hasta que liberes espacio o reactives un plan.',
      ],
      button: { label: 'Ver planes', url },
      footer: 'Gracias por haber apoyado a Noctcom. Puedes volver cuando quieras.',
    }),
  );
}

export async function sendVerificationEmail(to: string, code: string) {
  const verifyUrl = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/verify?code=${code}`;

  await sendEmail(
    to,
    'Verifica tu cuenta — Noctcom',
    `Te damos la bienvenida a Noctcom.\n\nTu código de verificación es: ${code}\n\nO abre este enlace: ${verifyUrl}\n\nSi no creaste esta cuenta, puedes ignorar este mensaje.`,
    renderEmail({
      preheader: `Tu código de verificación es ${code}`,
      title: 'Te damos la bienvenida',
      intro: 'Usa el siguiente código para confirmar tu dirección de correo y activar tu cuenta.',
      code,
      caption: 'Código de verificación',
      button: { label: 'Verificar cuenta', url: verifyUrl },
      footer: 'Si no creaste esta cuenta, puedes ignorar este mensaje con total tranquilidad.',
    }),
  );
}

export async function sendLoginCodeEmail(to: string, code: string) {
  await sendEmail(
    to,
    `${code} es tu código de acceso — Noctcom`,
    `Tu código de acceso es: ${code}\n\nExpira en 10 minutos. Si no intentaste iniciar sesión, alguien podría tener tu contraseña: cámbiala cuanto antes.`,
    renderEmail({
      preheader: `Tu código de acceso es ${code} (expira en 10 min)`,
      title: 'Código de acceso',
      intro: 'Introduce este código para completar el inicio de sesión. Caduca en 10 minutos.',
      code,
      caption: 'Expira en 10 minutos',
      footer:
        'Si no intentaste iniciar sesión, alguien podría conocer tu contraseña. Te recomendamos cambiarla cuanto antes.',
    }),
  );
}

export async function sendPasswordResetEmail(to: string, code: string) {
  const resetUrl = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/recovery?code=${code}`;

  await sendEmail(
    to,
    'Recuperación de cuenta — Noctcom',
    `Código de recuperación: ${code}\n\nEnlace: ${resetUrl}\n\nExpira en 15 minutos. Si no solicitaste esto, puedes ignorar este mensaje.`,
    renderEmail({
      preheader: `Tu código de recuperación es ${code} (expira en 15 min)`,
      title: 'Recupera tu cuenta',
      intro: 'Recibimos una solicitud para restablecer el acceso a tu cuenta. Usa este código para continuar.',
      code,
      caption: 'Expira en 15 minutos',
      button: { label: 'Recuperar cuenta', url: resetUrl },
      footer: 'Si no solicitaste esto, puedes ignorar este mensaje; tu cuenta seguirá protegida.',
    }),
  );
}
