import { apiError } from "@/lib/api/http";
import { requireAgent, requireAgentRequestOrigin } from "@/lib/api/agent-auth";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { createRealtimeTicket, getRealtimeTicketParticipantId } from "@/lib/realtime/tickets";

export async function POST(request: Request) {
  try {
    requireAgentRequestOrigin(request);
    enforceRateLimit(request, "agent-realtime-ticket", 20);
    const agent = await requireAgent(request);
    const ticket = createRealtimeTicket({
      roomId: "agent-queue",
      sessionId: 0,
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
