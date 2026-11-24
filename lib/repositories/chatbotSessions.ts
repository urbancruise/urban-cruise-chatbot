import type { ResultSetHeader } from "mysql2/promise";
import { db, type DbRow } from "@/lib/db";

export interface ChatSession extends DbRow {
  id: number;
  language_code: string;
  service_mode: "day" | "night";
  status: "active" | "closed";
}

export async function createSession(tokenHash: string, languageCode: string, mode: "day" | "night") {
  const [result] = await db.execute<ResultSetHeader>(
    "INSERT INTO chatbot_sessions (session_token_hash, language_code, service_mode) VALUES (?, ?, ?)",
    [tokenHash, languageCode, mode],
  );
  return result.insertId;
}

export async function findActiveSessionByTokenHash(tokenHash: string) {
  const [rows] = await db.execute<ChatSession[]>(
    "SELECT id, language_code, service_mode, status FROM chatbot_sessions WHERE session_token_hash = ? AND status = 'active' LIMIT 1",
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
