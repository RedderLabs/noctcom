import { createTransport, type Transporter } from 'nodemailer';
import { env } from './config.js';

let transporter: Transporter;

export function initMail() {
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

export async function sendVerificationEmail(to: string, code: string) {
  const verifyUrl = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/verify?code=${code}`;

  await transporter.sendMail({
    from: `"Noctcom" <${env.SMTP_FROM}>`,
    to,
    subject: 'Verifica tu cuenta — Noctcom',
    text: `Tu código de verificación es: ${code}\n\nO abre este enlace: ${verifyUrl}\n\nSi no creaste esta cuenta, ignora este mensaje.`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f0f17; color: #ededf3; border-radius: 12px;">
        <h2 style="color: #a78bfa; margin: 0 0 24px;">Noctcom</h2>
        <p style="margin: 0 0 16px; color: #a0a0b8;">Tu código de verificación:</p>
        <div style="background: #1c1c28; border: 1px solid #2a2a3d; border-radius: 8px; padding: 16px; text-align: center; margin: 0 0 24px;">
          <code style="font-size: 28px; letter-spacing: 4px; color: #ededf3; font-weight: bold;">${code}</code>
        </div>
        <a href="${verifyUrl}" style="display: block; text-align: center; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Verificar cuenta</a>
        <p style="margin: 24px 0 0; font-size: 12px; color: #6b6b85;">Si no creaste esta cuenta, ignora este mensaje.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, code: string) {
  const resetUrl = `${env.FRONTEND_URL ?? env.PUBLIC_URL}/recovery?code=${code}`;

  await transporter.sendMail({
    from: `"Noctcom" <${env.SMTP_FROM}>`,
    to,
    subject: 'Recuperación de cuenta — Noctcom',
    text: `Código de recuperación: ${code}\n\nEnlace: ${resetUrl}\n\nExpira en 15 minutos. Si no solicitaste esto, ignora este mensaje.`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f0f17; color: #ededf3; border-radius: 12px;">
        <h2 style="color: #a78bfa; margin: 0 0 24px;">Noctcom</h2>
        <p style="margin: 0 0 16px; color: #a0a0b8;">Código de recuperación (expira en 15 min):</p>
        <div style="background: #1c1c28; border: 1px solid #2a2a3d; border-radius: 8px; padding: 16px; text-align: center; margin: 0 0 24px;">
          <code style="font-size: 28px; letter-spacing: 4px; color: #ededf3; font-weight: bold;">${code}</code>
        </div>
        <a href="${resetUrl}" style="display: block; text-align: center; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Recuperar cuenta</a>
        <p style="margin: 24px 0 0; font-size: 12px; color: #6b6b85;">Si no solicitaste esto, ignora este mensaje.</p>
      </div>
    `,
  });
}
