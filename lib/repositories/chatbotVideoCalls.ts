import type { ResultSetHeader } from "mysql2/promise";
import { db, type DbRow } from "@/lib/db";
import { CHAT_HISTORY_RETENTION_DAYS } from "@/lib/repositories/chatbotMessages";
import { touchSession } from "@/lib/repositories/chatbotSessions";

export interface ScheduledVideoCall extends DbRow {
  session_id: number;
  name: string;
  email: string;
  phone: string;
  scheduled_at: string;
  time_zone: string;
}

export async function createScheduledVideoCall(input: {
  sessionId: number;
  name: string;
  email: string;
  phone: string;
  scheduledAt: string;
  timeZone: string;
}) {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO chatbot_video_call_requests
      (session_id, name, email, phone, scheduled_at, time_zone, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(?, INTERVAL 1 DAY))`,
    [
      input.sessionId,
      input.name,
      input.email,
      input.phone,
      new Date(input.scheduledAt),
      input.timeZone,
      new Date(input.scheduledAt),
    ],
  );
  return result.insertId;
}

export async function findScheduledVideoCallByTokenHash(tokenHash: string) {
  const [rows] = await db.execute<ScheduledVideoCall[]>(
    `SELECT v.session_id, v.name, v.email, v.phone,
       DATE_FORMAT(v.scheduled_at, '%Y-%m-%dT%H:%i:%s.000Z') AS scheduled_at,
       v.time_zone
     FROM chatbot_video_call_requests v
     JOIN chatbot_sessions s ON s.id = v.session_id
     WHERE s.session_token_hash = ? AND s.status = 'active'
       AND s.last_activity_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${CHAT_HISTORY_RETENTION_DAYS} DAY)
       AND v.expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [tokenHash],
  );
  const call = rows[0] ?? null;
  if (call) await touchSession(call.session_id);
  return call;
}
