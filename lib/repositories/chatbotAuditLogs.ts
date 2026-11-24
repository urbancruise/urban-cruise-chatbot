import type { ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";

export async function createAuditLog(
  eventType: string,
  sessionId: number | null,
  eventData: Record<string, unknown> | null,
) {
  const [result] = await db.execute<ResultSetHeader>(
    "INSERT INTO chatbot_audit_logs (session_id, event_type, event_data) VALUES (?, ?, ?)",
    [sessionId, eventType, eventData === null ? null : JSON.stringify(eventData)],
  );
  return result.insertId;
}
