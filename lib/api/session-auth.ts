import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/http";
import { findActiveSessionByTokenHash, touchSession } from "@/lib/repositories/chatbotSessions";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function requireSession(token: string) {
  const session = await findActiveSessionByTokenHash(hashSessionToken(token));
  if (!session) throw new ApiError("SESSION_NOT_FOUND", 401);
  await touchSession(session.id);
  return session;
}
