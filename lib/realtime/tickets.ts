import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type RealtimeParticipantRole = "customer" | "agent" | "guest";

export interface RealtimeTicketClaims {
  roomId: string;
  sessionId: number;
  participantId: string;
  role: RealtimeParticipantRole;
  displayName: string;
  recordingConsent?: boolean;
  expiresAt: number;
}

function getSecret() {
  const secret = process.env.CHATBOT_REALTIME_SECRET;
  if (!secret) throw new Error("CHATBOT_REALTIME_SECRET is required for video calls.");
  return secret;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createRealtimeTicket(input: Omit<RealtimeTicketClaims, "participantId" | "expiresAt">) {
  const claims: RealtimeTicketClaims = {
    ...input,
    participantId: randomUUID(),
    expiresAt: Math.floor(Date.now() / 1000) + 4 * 60 * 60,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload, getSecret()).toString("hex")}`;
}

export function getRealtimeTicketParticipantId(ticket: string) {
  const [payload] = ticket.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RealtimeTicketClaims;
  return claims.participantId;
}

export function verifyRealtimeTicket(ticket: string): RealtimeTicketClaims | null {
  const [payload, signature, extra] = ticket.split(".");
  if (!payload || !signature || extra || !/^[a-f0-9]{64}$/i.test(signature)) return null;

  const expected = sign(payload, getSecret());
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RealtimeTicketClaims;
    if (
      typeof claims.roomId !== "string" ||
      typeof claims.sessionId !== "number" ||
      !Number.isSafeInteger(claims.sessionId) ||
      typeof claims.participantId !== "string" ||
      !["customer", "agent", "guest"].includes(claims.role) ||
      typeof claims.displayName !== "string" ||
      (claims.recordingConsent !== undefined && typeof claims.recordingConsent !== "boolean") ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    return claims;
  } catch {
    return null;
  }
}
