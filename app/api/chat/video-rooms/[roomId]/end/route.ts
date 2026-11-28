import { apiError, readJson, validationError } from "@/lib/api/http";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { requireActiveVideoCallTicket } from "@/lib/api/video-call-ticket";
import { endVideoCallRoom } from "@/lib/repositories/chatbotVideoRooms";
import { publishVideoCallEvent } from "@/lib/realtime";
import { z } from "zod";

const bodySchema = z.object({ ticket: z.string().min(1) }).strict();
const roomIdSchema = z.string().uuid();
type RouteContext = { params: Promise<{ roomId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "video-call-end", 20);
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const { roomId } = await params;
    if (!roomIdSchema.safeParse(roomId).success) return Response.json({ error: { code: "VIDEO_CALL_NOT_FOUND" } }, { status: 404 });
    const { room } = await requireActiveVideoCallTicket(parsed.data.ticket, roomId);
    await endVideoCallRoom(room.room_id);
    const delivered = await publishVideoCallEvent(room.room_id, "call_ended");
    if (!delivered) {
      return Response.json({ error: { code: "CALL_ENDED_LIVE_DELIVERY_FAILED" } }, { status: 503 });
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
