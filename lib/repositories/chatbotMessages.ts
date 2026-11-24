import type { ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";

export type MessageMatchType = "exact" | "normalized_phrase" | "keyword" | "category" | "fallback" | null;

export async function createMessage(input: {
  sessionId: number;
  messageType: "user" | "assistant" | "system";
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
