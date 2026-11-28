import { ApiError } from "@/lib/api/http";
import { findActiveVideoCallRoom } from "@/lib/repositories/chatbotVideoRooms";
import { verifyRealtimeTicket } from "@/lib/realtime/tickets";

export async function requireActiveVideoCallTicket(ticket: unknown, roomId?: string) {
  if (typeof ticket !== "string") throw new ApiError("VIDEO_CALL_UNAUTHORIZED", 401);
  const claims = verifyRealtimeTicket(ticket);
  if (!claims || (roomId && claims.roomId !== roomId) || claims.roomId === "agent-queue") {
    throw new ApiError("VIDEO_CALL_UNAUTHORIZED", 401);
  }
  const room = await findActiveVideoCallRoom(claims.roomId);
  if (!room || room.session_id !== claims.sessionId) throw new ApiError("VIDEO_CALL_NOT_FOUND", 404);
  return { claims, room };
}
