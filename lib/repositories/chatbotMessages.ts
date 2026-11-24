import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";

export const CHAT_HISTORY_RETENTION_DAYS = 90;

export type MessageMatchType = "exact" | "normalized_phrase" | "keyword" | "category" | "fallback" | null;

interface RecentMessageRow extends RowDataPacket {
  id: number;
  message_type: "user" | "assistant" | "agent";
  body: string;
}

export async function listRecentMessages(sessionId: number) {
  const [rows] = await db.execute<RecentMessageRow[]>(
    `SELECT id, message_type, body
     FROM chatbot_messages
     WHERE session_id = ?
       AND message_type IN ('user', 'assistant', 'agent')
       AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${CHAT_HISTORY_RETENTION_DAYS} DAY)
     ORDER BY id`,
    [sessionId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    author: row.message_type,
    text: row.body,
  }));
}

export async function deleteExpiredMessages() {
  await db.execute(
    `DELETE FROM chatbot_messages
     WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${CHAT_HISTORY_RETENTION_DAYS} DAY)`,
  );
}

export async function createMessage(input: {
  sessionId: number;
  messageType: "user" | "assistant" | "agent" | "system";
  body: string;
  faqId?: number | null;
  matchType?: MessageMatchType;
}) {
  const [result] = await db.execute<ResultSetHeader>(
    "INSERT INTO chatbot_messages (session_id, message_type, body, faq_id, match_type) VALUES (?, ?, ?, ?, ?)",
    [input.sessionId, input.messageType, input.body, input.faqId ?? null, input.matchType ?? null],
  );
  return result.insertId;
}
