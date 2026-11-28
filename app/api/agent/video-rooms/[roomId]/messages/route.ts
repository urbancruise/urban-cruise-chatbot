import { apiError, ApiError } from "@/lib/api/http";
import { requireAgent } from "@/lib/api/agent-auth";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { findAgentConversation } from "@/lib/repositories/chatbotAgents";
import { listVideoCallTranscript } from "@/lib/repositories/chatbotMessages";
import { findVideoCallRoomForTranscript } from "@/lib/repositories/chatbotVideoRooms";
import { z } from "zod";

type RouteContext = { params: Promise<{ roomId: string }> };
const roomIdSchema = z.string().uuid();

export async function GET(request: Request, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "agent-video-call-transcript", 60);
    const agent = await requireAgent(request);
    const { roomId } = await params;
    const parsedRoomId = roomIdSchema.safeParse(roomId);
    if (!parsedRoomId.success) throw new ApiError("VIDEO_CALL_NOT_FOUND", 404);
    const room = await findVideoCallRoomForTranscript(parsedRoomId.data);
    if (!room) throw new ApiError("VIDEO_CALL_NOT_FOUND", 404);
    const conversation = await findAgentConversation(room.session_id);
    if (conversation?.assigned_agent_id !== agent.id) throw new ApiError("VIDEO_CALL_NOT_FOUND", 404);

    return Response.json(
      { messages: await listVideoCallTranscript(room.session_id, room.created_at) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
