/**
 * Genera una vista previa HTML de la plantilla de email (sin enviar nada).
 * Replica renderEmail con datos de muestra y lo guarda para abrir en el navegador.
 *   npx tsx scripts/preview-email.ts
 */
import { writeFileSync } from 'node:fs';

const base = 'https://noctcom.com';
const year = 2026;
const opts = {
  title: 'Código de acceso',
  intro: 'Introduce este código para completar el inicio de sesión. Caduca en 10 minutos.',
  code: '284913',
  caption: 'Expira en 10 minutos',
  button: { label: 'Verificar actividad', url: '#' },
  footer: 'Si no intentaste iniciar sesión, alguien podría conocer tu contraseña. Te recomendamos cambiarla cuanto antes.',
};

const logoUrl = `${base}/logo.png`;
const button = opts.button
  ? `<tr><td align="center" style="padding: 4px 0 8px;"><a href="${opts.button.url}" style="display: inline-block; background: #7c3aed; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);">${opts.button.label}</a></td></tr>`
  : '';
const codeChars = opts.code.split('').map((c) =>
  `<span style="display: inline-block; min-width: 16px; margin: 0 4px; font-size: 32px; line-height: 1; font-weight: 700; letter-spacing: 2px; color: #d2bbff;">${c}</span>`,
).join('');

const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Noctcom — preview</title></head>
<body style="margin: 0; padding: 0; background: #07070d; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #07070d; padding: 40px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background: #0f0f17; border: 1px solid #1e1e2c; border-radius: 16px; overflow: hidden;">
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%);">&nbsp;</td></tr>
      <tr><td align="center" style="padding: 36px 40px 4px;"><img src="${logoUrl}" width="48" height="48" alt="Noctcom" style="display: block; border-radius: 12px; margin: 0 auto 12px;"><div style="font-family: 'Segoe UI', system-ui, sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; color: #ffffff;">Noctcom</div></td></tr>
      <tr><td style="padding: 20px 40px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Segoe UI', system-ui, sans-serif;">
        <tr><td align="center" style="font-size: 20px; font-weight: 600; color: #ededf3; padding: 0 0 8px;">${opts.title}</td></tr>
        <tr><td align="center" style="font-size: 15px; line-height: 1.6; color: #9a9ab2; padding: 0 0 24px;">${opts.intro}</td></tr>
        <tr><td align="center" style="padding: 0 0 12px;"><table role="presentation" cellpadding="0" cellspacing="0" style="background: #15151f; border: 1px solid #2a2a3d; border-radius: 12px;"><tr><td align="center" style="padding: 22px 28px; font-family: monospace; white-space: nowrap;">${codeChars}</td></tr></table></td></tr>
        <tr><td align="center" style="font-size: 12px; color: #6b6b85; padding: 0 0 28px;">${opts.caption}</td></tr>
        ${button}
      </table></td></tr>
      <tr><td align="center" style="padding: 12px 40px 0;"><table role="presentation" cellpadding="0" cellspacing="0" style="background: #14121f; border: 1px solid #2a2640; border-radius: 999px;"><tr><td style="padding: 7px 14px; font-family: monospace; font-size: 11px; color: #9a9ab2;"><span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #34d399; margin-right: 7px;">&nbsp;</span>Cifrado zero-knowledge de extremo a extremo</td></tr></table></td></tr>
      <tr><td style="padding: 24px 40px 0;"><div style="border-top: 1px solid #1e1e2c;"></div></td></tr>
      <tr><td style="padding: 18px 40px 32px; font-family: 'Segoe UI', system-ui, sans-serif;">
        <p style="margin: 0 0 14px; font-size: 12px; line-height: 1.5; color: #6b6b85;">${opts.footer}</p>
        <p style="margin: 0 0 12px; font-size: 12px;"><a href="#" style="color: #8e8ea8; text-decoration: none;">Privacidad</a><span style="color: #3a3a4a;">&nbsp;·&nbsp;</span><a href="#" style="color: #8e8ea8; text-decoration: none;">Términos</a><span style="color: #3a3a4a;">&nbsp;·&nbsp;</span><a href="#" style="color: #8e8ea8; text-decoration: none;">Soporte</a></p>
        <p style="margin: 0; font-size: 11px; color: #4a4a5e;">© ${year} Noctcom · Redder Labs · tu nube privada cifrada</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

writeFileSync('email-preview.html', html);
console.log('vista previa -> backend/email-preview.html');
