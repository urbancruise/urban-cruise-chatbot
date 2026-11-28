import nodemailer from "nodemailer";
import { ApiError } from "@/lib/api/http";

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

interface ScheduledVideoCallEmail {
  to: string;
  name: string;
  scheduledAt: string;
  timeZone: string;
  joinUrl: string;
}

export function createVideoCallJoinUrl(baseUrl: string, sessionToken: string) {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ApiError("EMAIL_UNAVAILABLE", 503);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new ApiError("EMAIL_UNAVAILABLE", 503);
  }
  return new URL(`/video-call/${encodeURIComponent(sessionToken)}`, url).toString();
}

export function assertSmtpConfigured() {
  return smtpConfig();
}

export async function sendScheduledVideoCallEmail(
  config: SmtpConfig,
  input: ScheduledVideoCallEmail,
) {
  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: input.timeZone,
  }).format(new Date(input.scheduledAt));
  const escapedName = escapeHtml(input.name);
  const escapedUrl = escapeHtml(input.joinUrl);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });

  await transporter.sendMail({
    from: config.from,
    to: input.to,
    subject: "Your Urban Cruise video call joining link",
    text: [
      `Hello ${input.name},`,
      "",
      `Your video call is scheduled for ${formattedDate} (${input.timeZone}).`,
      `Join the call: ${input.joinUrl}`,
      "",
      "Our sales team will confirm availability.",
    ].join("\n"),
    html: [
      `<p>Hello ${escapedName},</p>`,
      `<p>Your video call is scheduled for <strong>${escapeHtml(formattedDate)}</strong> (${escapeHtml(input.timeZone)}).</p>`,
      `<p><a href="${escapedUrl}">Join your Urban Cruise video call</a></p>`,
      "<p>Our sales team will confirm availability.</p>",
    ].join(""),
  });
}

function smtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from) {
    throw new ApiError("EMAIL_UNAVAILABLE", 503);
  }
  return { host, port, user, password, from };
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, character => entities[character]);
}
