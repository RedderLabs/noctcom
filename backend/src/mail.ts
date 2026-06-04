import { createTransport, type Transporter } from 'nodemailer';
import { env } from './config.js';

let transporter: Transporter | null = null;
let resendApiKey: string | null = null;
let fromAddress: string;

export type MailLocale = 'es' | 'en';

// Normaliza cualquier hint de idioma (header Accept-Language, preferred_locales
// de Stripe, etc.) a los idiomas que soportamos. Por defecto, español.
export function normalizeLocale(hint?: string | string[] | null): MailLocale {
  const raw = Array.isArray(hint) ? hint[0] : hint;
  return raw && raw.toLowerCase().startsWith('en') ? 'en' : 'es';
}

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

// ─── Chrome compartido (traducido) ─────────────────────────
const CHROME: Record<MailLocale, { badge: string; privacy: string; terms: string; support: string; copy: string }> = {
  es: {
    badge: 'Cifrado zero-knowledge de extremo a extremo',
    privacy: 'Privacidad',
    terms: 'Términos',
    support: 'Soporte',
    copy: 'tu nube privada cifrada',
  },
  en: {
    badge: 'End-to-end zero-knowledge encryption',
    privacy: 'Privacy',
    terms: 'Terms',
    support: 'Support',
    copy: 'your private encrypted cloud',
  },
};

// Las páginas legales viven sin prefijo en español y bajo /en en inglés.
const localePrefix = (locale: MailLocale) => (locale === 'en' ? '/en' : '');

// ─── Plantilla base ───────────────────────────────────────
// Email HTML compatible con la mayoría de clientes (tablas + estilos inline).
// Paleta Noctcom: fondo nocturno, acentos violeta.

interface EmailLayoutOptions {
  locale: MailLocale;
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
  const c = CHROME[opts.locale];
  const lp = localePrefix(opts.locale);

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
<html lang="${opts.locale}">
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
                    <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #34d399; margin-right: 7px;">&nbsp;</span>${c.badge}
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
                <a href="${base}${lp}/privacidad" style="color: #8e8ea8; text-decoration: none;">${c.privacy}</a>
                <span style="color: #3a3a4a;">&nbsp;·&nbsp;</span>
                <a href="${base}${lp}/terminos" style="color: #8e8ea8; text-decoration: none;">${c.terms}</a>
                <span style="color: #3a3a4a;">&nbsp;·&nbsp;</span>
                <a href="mailto:hello@noctcom.com" style="color: #8e8ea8; text-decoration: none;">${c.support}</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #4a4a5e;">© ${year} Noctcom · Redder Labs · ${c.copy}</p>
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
interface NoticeOptions {
  locale: MailLocale;
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
  const c = CHROME[opts.locale];
  const lp = localePrefix(opts.locale);
  const button = opts.button
    ? `<tr><td align="center" style="padding: 8px 0 4px;"><a href="${opts.button.url}" style="display: inline-block; background: #7c3aed; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 10px;">${opts.button.label}</a></td></tr>`
    : '';
  const body = opts.paragraphs
    .map((p) => `<tr><td style="font-size: 15px; line-height: 1.6; color: #9a9ab2; padding: 0 0 16px;">${p}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="${opts.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark light"><title>Noctcom</title></head>
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
        <p style="margin: 0 0 12px; font-size: 12px;"><a href="${base}${lp}/privacidad" style="color: #8e8ea8; text-decoration: none;">${c.privacy}</a><span style="color: #3a3a4a;">&nbsp;·&nbsp;</span><a href="${base}${lp}/terminos" style="color: #8e8ea8; text-decoration: none;">${c.terms}</a><span style="color: #3a3a4a;">&nbsp;·&nbsp;</span><a href="mailto:hello@noctcom.com" style="color: #8e8ea8; text-decoration: none;">${c.support}</a></p>
        <p style="margin: 0; font-size: 11px; color: #4a4a5e;">© ${year} Noctcom · Redder Labs · ${c.copy}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

const fmtDate = (d: Date | null, locale: MailLocale) =>
  d ? d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

// ─── Emails de ciclo de vida de la suscripción (P3) ───────
// El email lo aporta el llamador (lo lee de Stripe; no se almacena en Noctcom).
// El locale sale de preferred_locales del cliente de Stripe (o 'es' por defecto).

export async function sendPlanActiveEmail(to: string, planLabel: string, quotaLabel: string, locale: MailLocale = 'es') {
  const url = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/vault`;
  const t = {
    es: {
      subject: `Tu plan ${planLabel} está activo — Noctcom`,
      text: `Gracias por apoyar Noctcom. Tu cuenta ahora tiene ${quotaLabel} de almacenamiento cifrado.\n\n${url}`,
      preheader: `Tu plan ${planLabel} ya está activo (${quotaLabel}).`,
      title: `Tu plan ${planLabel} está activo`,
      p1: `Gracias por apoyar a Noctcom. Tu cuenta tiene ahora <strong style="color:#ededf3;">${quotaLabel}</strong> de almacenamiento con el mismo cifrado zero-knowledge de siempre.`,
      p2: 'Pagas por espacio, nunca por tus datos: tus archivos siguen siendo ilegibles para nosotros.',
      button: 'Ir a mi bóveda',
      footer: 'Puedes cambiar o cancelar tu plan cuando quieras desde Ajustes → Plan y uso.',
    },
    en: {
      subject: `Your ${planLabel} plan is active — Noctcom`,
      text: `Thanks for supporting Noctcom. Your account now has ${quotaLabel} of encrypted storage.\n\n${url}`,
      preheader: `Your ${planLabel} plan is now active (${quotaLabel}).`,
      title: `Your ${planLabel} plan is active`,
      p1: `Thanks for supporting Noctcom. Your account now has <strong style="color:#ededf3;">${quotaLabel}</strong> of storage with the same zero-knowledge encryption as always.`,
      p2: 'You pay for space, never for your data: your files remain unreadable to us.',
      button: 'Go to my vault',
      footer: 'You can change or cancel your plan anytime from Settings → Plan & usage.',
    },
  }[locale];
  await sendEmail(to, t.subject, t.text, renderNotice({
    locale, preheader: t.preheader, title: t.title, paragraphs: [t.p1, t.p2],
    button: { label: t.button, url }, footer: t.footer,
  }));
}

export async function sendPlanCanceledScheduledEmail(to: string, planLabel: string, revertDate: Date | null, locale: MailLocale = 'es') {
  const url = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/vault/settings`;
  const date = fmtDate(revertDate, locale);
  const t = {
    es: {
      subject: 'Cancelación programada — Noctcom',
      text: `Has cancelado tu plan ${planLabel}. Lo conservas hasta el ${date}; después tu cuenta vuelve al plan Gratuito (1 GB). No se borra nada.\n\n${url}`,
      preheader: `Conservas tu plan ${planLabel} hasta el ${date}.`,
      title: 'Cancelación programada',
      p1: `Has cancelado tu plan <strong style="color:#ededf3;">${planLabel}</strong>. Seguirás disfrutándolo${date ? ` hasta el <strong style="color:#ededf3;">${date}</strong>` : ' hasta el final del periodo ya pagado'}.`,
      p2: 'Después, tu cuenta volverá al plan <strong style="color:#ededf3;">Gratuito (1 GB)</strong>. No borramos nada: tus archivos siguen ahí. Si superas 1 GB, la cuenta quedará en solo lectura (podrás descargar y exportar) hasta que liberes espacio o reactives un plan.',
      p3: 'Si cambias de idea, puedes reactivar tu plan antes de esa fecha sin perder nada.',
      button: 'Gestionar mi plan',
      footer: 'Recibes este aviso porque cancelaste una suscripción de Noctcom.',
    },
    en: {
      subject: 'Scheduled cancellation — Noctcom',
      text: `You've cancelled your ${planLabel} plan. You keep it until ${date}; after that your account reverts to the Free plan (1 GB). Nothing is deleted.\n\n${url}`,
      preheader: `You keep your ${planLabel} plan until ${date}.`,
      title: 'Scheduled cancellation',
      p1: `You've cancelled your <strong style="color:#ededf3;">${planLabel}</strong> plan. You'll keep enjoying it${date ? ` until <strong style="color:#ededf3;">${date}</strong>` : ' until the end of the period you already paid for'}.`,
      p2: 'After that, your account will revert to the <strong style="color:#ededf3;">Free plan (1 GB)</strong>. We don\'t delete anything: your files stay there. If you exceed 1 GB, the account becomes read-only (you can still download and export) until you free up space or reactivate a plan.',
      p3: 'If you change your mind, you can reactivate your plan before that date without losing anything.',
      button: 'Manage my plan',
      footer: 'You\'re receiving this because you cancelled a Noctcom subscription.',
    },
  }[locale];
  await sendEmail(to, t.subject, t.text, renderNotice({
    locale, preheader: t.preheader, title: t.title, paragraphs: [t.p1, t.p2, t.p3],
    button: { label: t.button, url }, footer: t.footer,
  }));
}

export async function sendPaymentFailedEmail(to: string, planLabel: string, locale: MailLocale = 'es') {
  const url = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/vault/settings`;
  const t = {
    es: {
      subject: 'No pudimos cobrar tu plan — Noctcom',
      text: `Ha fallado el cobro de tu plan ${planLabel}. Actualiza tu método de pago para no perder tu espacio.\n\n${url}`,
      preheader: `Falló el cobro de tu plan ${planLabel}. Actualiza tu método de pago.`,
      title: 'No pudimos cobrar tu plan',
      p1: `Ha fallado el cobro de tu plan <strong style="color:#ededf3;">${planLabel}</strong>. Lo reintentaremos en los próximos días.`,
      p2: 'Para no perder tu espacio, revisa o actualiza tu método de pago. Tus archivos están a salvo: nada se borra por un pago fallido.',
      button: 'Actualizar método de pago',
      footer: 'Si ya lo has solucionado, ignora este mensaje.',
    },
    en: {
      subject: 'We couldn\'t charge your plan — Noctcom',
      text: `We couldn't charge your ${planLabel} plan. Update your payment method so you don't lose your space.\n\n${url}`,
      preheader: `Your ${planLabel} plan payment failed. Update your payment method.`,
      title: 'We couldn\'t charge your plan',
      p1: `The charge for your <strong style="color:#ededf3;">${planLabel}</strong> plan failed. We'll retry over the next few days.`,
      p2: 'To avoid losing your space, review or update your payment method. Your files are safe: nothing is deleted because of a failed payment.',
      button: 'Update payment method',
      footer: 'If you\'ve already fixed it, please ignore this message.',
    },
  }[locale];
  await sendEmail(to, t.subject, t.text, renderNotice({
    locale, preheader: t.preheader, title: t.title, paragraphs: [t.p1, t.p2],
    button: { label: t.button, url }, footer: t.footer,
  }));
}

export async function sendPlanEndedEmail(to: string, locale: MailLocale = 'es') {
  const url = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/vault/settings`;
  const t = {
    es: {
      subject: 'Tu plan ha vuelto a Gratuito — Noctcom',
      text: `Tu plan ha finalizado y tu cuenta vuelve al plan Gratuito (1 GB). Tus archivos siguen intactos.\n\n${url}`,
      preheader: 'Tu plan ha finalizado; tu cuenta vuelve al plan Gratuito (1 GB).',
      title: 'Tu plan ha vuelto a Gratuito',
      p1: 'Tu plan ha finalizado y tu cuenta vuelve al <strong style="color:#ededf3;">plan Gratuito (1 GB)</strong>.',
      p2: 'Tus archivos siguen intactos. Si superas 1 GB, la cuenta queda en solo lectura (podrás descargar y exportar) hasta que liberes espacio o reactives un plan.',
      button: 'Ver planes',
      footer: 'Gracias por haber apoyado a Noctcom. Puedes volver cuando quieras.',
    },
    en: {
      subject: 'Your plan reverted to Free — Noctcom',
      text: `Your plan has ended and your account reverts to the Free plan (1 GB). Your files remain intact.\n\n${url}`,
      preheader: 'Your plan has ended; your account reverts to the Free plan (1 GB).',
      title: 'Your plan reverted to Free',
      p1: 'Your plan has ended and your account reverts to the <strong style="color:#ededf3;">Free plan (1 GB)</strong>.',
      p2: 'Your files remain intact. If you exceed 1 GB, the account becomes read-only (you can still download and export) until you free up space or reactivate a plan.',
      button: 'View plans',
      footer: 'Thanks for supporting Noctcom. You can come back anytime.',
    },
  }[locale];
  await sendEmail(to, t.subject, t.text, renderNotice({
    locale, preheader: t.preheader, title: t.title, paragraphs: [t.p1, t.p2],
    button: { label: t.button, url }, footer: t.footer,
  }));
}

export async function sendVerificationEmail(to: string, code: string, locale: MailLocale = 'es') {
  const verifyUrl = `${env.FRONTEND_URL ?? env.PUBLIC_URL}${localePrefix(locale)}/verify?code=${code}`;
  const t = {
    es: {
      subject: 'Verifica tu cuenta — Noctcom',
      text: `Te damos la bienvenida a Noctcom.\n\nTu código de verificación es: ${code}\n\nO abre este enlace: ${verifyUrl}\n\nSi no creaste esta cuenta, puedes ignorar este mensaje.`,
      preheader: `Tu código de verificación es ${code}`,
      title: 'Te damos la bienvenida',
      intro: 'Usa el siguiente código para confirmar tu dirección de correo y activar tu cuenta.',
      caption: 'Código de verificación',
      button: 'Verificar cuenta',
      footer: 'Si no creaste esta cuenta, puedes ignorar este mensaje con total tranquilidad.',
    },
    en: {
      subject: 'Verify your account — Noctcom',
      text: `Welcome to Noctcom.\n\nYour verification code is: ${code}\n\nOr open this link: ${verifyUrl}\n\nIf you didn't create this account, you can ignore this message.`,
      preheader: `Your verification code is ${code}`,
      title: 'Welcome',
      intro: 'Use the code below to confirm your email address and activate your account.',
      caption: 'Verification code',
      button: 'Verify account',
      footer: 'If you didn\'t create this account, you can safely ignore this message.',
    },
  }[locale];
  await sendEmail(to, t.subject, t.text, renderEmail({
    locale, preheader: t.preheader, title: t.title, intro: t.intro, code,
    caption: t.caption, button: { label: t.button, url: verifyUrl }, footer: t.footer,
  }));
}

export async function sendLoginCodeEmail(to: string, code: string, locale: MailLocale = 'es') {
  const t = {
    es: {
      subject: `${code} es tu código de acceso — Noctcom`,
      text: `Tu código de acceso es: ${code}\n\nExpira en 10 minutos. Si no intentaste iniciar sesión, alguien podría tener tu contraseña: cámbiala cuanto antes.`,
      preheader: `Tu código de acceso es ${code} (expira en 10 min)`,
      title: 'Código de acceso',
      intro: 'Introduce este código para completar el inicio de sesión. Caduca en 10 minutos.',
      caption: 'Expira en 10 minutos',
      footer: 'Si no intentaste iniciar sesión, alguien podría conocer tu contraseña. Te recomendamos cambiarla cuanto antes.',
    },
    en: {
      subject: `${code} is your access code — Noctcom`,
      text: `Your access code is: ${code}\n\nIt expires in 10 minutes. If you didn't try to sign in, someone may have your password: change it as soon as possible.`,
      preheader: `Your access code is ${code} (expires in 10 min)`,
      title: 'Access code',
      intro: 'Enter this code to finish signing in. It expires in 10 minutes.',
      caption: 'Expires in 10 minutes',
      footer: 'If you didn\'t try to sign in, someone may know your password. We recommend changing it as soon as possible.',
    },
  }[locale];
  await sendEmail(to, t.subject, t.text, renderEmail({
    locale, preheader: t.preheader, title: t.title, intro: t.intro, code, caption: t.caption, footer: t.footer,
  }));
}

export async function sendPasswordResetEmail(to: string, code: string, locale: MailLocale = 'es') {
  const resetUrl = `${env.FRONTEND_URL ?? env.PUBLIC_URL}${localePrefix(locale)}/recovery?code=${code}`;
  const t = {
    es: {
      subject: 'Recuperación de cuenta — Noctcom',
      text: `Código de recuperación: ${code}\n\nEnlace: ${resetUrl}\n\nExpira en 15 minutos. Si no solicitaste esto, puedes ignorar este mensaje.`,
      preheader: `Tu código de recuperación es ${code} (expira en 15 min)`,
      title: 'Recupera tu cuenta',
      intro: 'Recibimos una solicitud para restablecer el acceso a tu cuenta. Usa este código para continuar.',
      caption: 'Expira en 15 minutos',
      button: 'Recuperar cuenta',
      footer: 'Si no solicitaste esto, puedes ignorar este mensaje; tu cuenta seguirá protegida.',
    },
    en: {
      subject: 'Account recovery — Noctcom',
      text: `Recovery code: ${code}\n\nLink: ${resetUrl}\n\nIt expires in 15 minutes. If you didn't request this, you can ignore this message.`,
      preheader: `Your recovery code is ${code} (expires in 15 min)`,
      title: 'Recover your account',
      intro: 'We received a request to reset access to your account. Use this code to continue.',
      caption: 'Expires in 15 minutes',
      button: 'Recover account',
      footer: 'If you didn\'t request this, you can ignore this message; your account stays protected.',
    },
  }[locale];
  await sendEmail(to, t.subject, t.text, renderEmail({
    locale, preheader: t.preheader, title: t.title, intro: t.intro, code,
    caption: t.caption, button: { label: t.button, url: resetUrl }, footer: t.footer,
  }));
}
