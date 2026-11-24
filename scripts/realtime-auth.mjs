import { createHash, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";

export function hashCustomerToken(token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export function verifyCmsTicket(ticket, secret) {
  let payload;
  try {
    payload = jwt.verify(ticket, secret, {
      issuer: "cms-urban-cruise",
      audience: "urban-cruise-chatbot-realtime",
    });
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.scope !== "chatbot.manage" ||
    typeof payload.sub !== "string" ||
    !/^[1-9]\d*$/.test(payload.sub) ||
    !Number.isSafeInteger(payload.exp)
  ) {
    return null;
  }

  const userId = Number(payload.sub);
  return Number.isSafeInteger(userId) ? { id: userId, expiresAt: payload.exp } : null;
}

export function hasValidPublishSecret(authorization, secret) {
  const supplied = typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? Buffer.from(authorization.slice(7))
    : Buffer.alloc(0);
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
