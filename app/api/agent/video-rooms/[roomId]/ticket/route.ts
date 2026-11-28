import { apiError, ApiError } from "@/lib/api/http";
import { requireAgent, requireAgentRequestOrigin } from "@/lib/api/agent-auth";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { findActiveVideoCallRoom } from "@/lib/repositories/chatbotVideoRooms";
import { createRealtimeTicket, getRealtimeTicketParticipantId } from "@/lib/realtime/tickets";
import { assignConversationToAgent, queueConversationForAgent } from "@/lib/repositories/chatbotAgents";

type RouteContext = { params: Promise<{ roomId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    requireAgentRequestOrigin(request);
    enforceRateLimit(request, "agent-video-call-ticket", 30);
    const agent = await requireAgent(request);
    const { roomId } = await params;
    const room = await findActiveVideoCallRoom(roomId);
    if (!room) throw new ApiError("VIDEO_CALL_NOT_FOUND", 404);
    await queueConversationForAgent(room.session_id);
    if (!(await assignConversationToAgent(room.session_id, agent.id))) {
      throw new ApiError("VIDEO_CALL_ALREADY_ASSIGNED", 409);
    }
    const ticket = createRealtimeTicket({
      roomId,
      sessionId: room.session_id,
      role: "agent",
      displayName: agent.displayName,
    });
    return Response.json(
      { ticket, participantId: getRealtimeTicketParticipantId(ticket) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
