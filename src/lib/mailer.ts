import nodemailer from "nodemailer";
import { logger } from "./logger";

/** SMTP mailer (SES in production). No SMTP configured → log-only (dev). */

function transport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const t = transport();
  if (!t) {
    logger.info("email (dev, not sent)", { to, subject });
    return;
  }
  await t.sendMail({
    from: process.env.EMAIL_FROM ?? "Hosty <no-reply@hosty.site>",
    to,
    subject,
    html,
  });
}

export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f5f7fb;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e9f0">
    <h1 style="font-size:18px;margin:0 0 16px;color:#111">${title}</h1>
    <div style="font-size:14px;color:#333;line-height:1.6">${bodyHtml}</div>
    <p style="font-size:12px;color:#999;margin-top:24px">Sent by Hosty · static hosting in seconds</p>
  </div></body></html>`;
}
