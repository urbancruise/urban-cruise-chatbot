import type { ResultSetHeader } from "mysql2/promise";
import { db, type DbRow } from "@/lib/db";
import { CHAT_HISTORY_RETENTION_DAYS } from "@/lib/repositories/chatbotMessages";

export interface ChatSession extends DbRow {
  id: number;
  language_code: string;
  service_mode: "day" | "night";
  status: "active" | "closed";
}

export async function createSession(
  tokenHash: string,
  languageCode: string,
  mode: "day" | "night",
  locationSlug: string,
) {
  const [result] = await db.execute<ResultSetHeader>(
    "INSERT INTO chatbot_sessions (session_token_hash, language_code, service_mode, location_slug) VALUES (?, ?, ?, ?)",
    [tokenHash, languageCode, mode, locationSlug],
  );
  return result.insertId;
}

export async function findActiveSessionByTokenHash(tokenHash: string) {
  const [rows] = await db.execute<ChatSession[]>(
    `SELECT id, language_code, service_mode, status FROM chatbot_sessions
     WHERE session_token_hash = ? AND status = 'active'
       AND last_activity_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${CHAT_HISTORY_RETENTION_DAYS} DAY)
     LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function touchSession(sessionId: number) {
  await db.execute(
    "UPDATE chatbot_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'",
    [sessionId],
  );
}
