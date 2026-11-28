import type { ResultSetHeader } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { db, type DbRow } from "@/lib/db";

export interface VideoCallRoom extends DbRow {
  room_id: string;
  session_id: number;
}

export interface VideoCallTranscriptRoom extends VideoCallRoom {
  created_at: string;
}

export async function createVideoCallRoom(sessionId: number) {
  const roomId = randomUUID();
  await db.execute(
    `INSERT INTO chatbot_video_call_rooms (room_id, session_id, expires_at)
     VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 HOUR))`,
    [roomId, sessionId],
  );
  return roomId;
}

export async function findActiveVideoCallRoom(roomId: string) {
  const [rows] = await db.execute<VideoCallRoom[]>(
    `SELECT room_id, session_id
     FROM chatbot_video_call_rooms
     WHERE room_id = ? AND status = 'active' AND expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [roomId],
  );
  return rows[0] ?? null;
}

export async function findVideoCallRoomForTranscript(roomId: string) {
  const [rows] = await db.execute<VideoCallTranscriptRoom[]>(
    `SELECT room_id, session_id, created_at
     FROM chatbot_video_call_rooms
     WHERE room_id = ?
       AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
     LIMIT 1`,
    [roomId],
  );
  return rows[0] ?? null;
}

export async function createVideoCallInvite(
  roomId: string,
  tokenHash: string,
) {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO chatbot_video_call_invites (token_hash, room_id, expires_at)
     SELECT ?, room_id, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)
     FROM chatbot_video_call_rooms
     WHERE room_id = ? AND status = 'active' AND expires_at > UTC_TIMESTAMP()`,
    [tokenHash, roomId],
  );
  return result.affectedRows === 1;
}

export async function consumeVideoCallInvite(tokenHash: string) {
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE chatbot_video_call_invites i
     JOIN chatbot_video_call_rooms r ON r.room_id = i.room_id
     SET i.used_at = UTC_TIMESTAMP()
     WHERE i.token_hash = ? AND i.used_at IS NULL
       AND i.expires_at > UTC_TIMESTAMP()
       AND r.status = 'active' AND r.expires_at > UTC_TIMESTAMP()`,
    [tokenHash],
  );
  if (result.affectedRows !== 1) return null;

  const [rows] = await db.execute<VideoCallRoom[]>(
    `SELECT r.room_id, r.session_id
     FROM chatbot_video_call_invites i
     JOIN chatbot_video_call_rooms r ON r.room_id = i.room_id
     WHERE i.token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function endVideoCallRoom(roomId: string) {
  await db.execute(
    "UPDATE chatbot_video_call_rooms SET status = 'ended', ended_at = UTC_TIMESTAMP() WHERE room_id = ? AND status = 'active'",
    [roomId],
  );
}
