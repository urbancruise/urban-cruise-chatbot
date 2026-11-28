import { createHash } from "node:crypto";
import { apiError, ApiError, readJson } from "@/lib/api/http";
import { getCurrentAgent } from "@/lib/api/agent-auth";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { consumeVideoCallInvite } from "@/lib/repositories/chatbotVideoRooms";
import { createRealtimeTicket, getRealtimeTicketParticipantId } from "@/lib/realtime/tickets";
import { z } from "zod";

const joinBodySchema = z.object({
  inviteToken: z.string().regex(/^[a-f0-9]{64}$/i),
  displayName: z.string().trim().min(1).max(120),
  recordingConsent: z.boolean().optional().default(false),
}).strict();

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "video-call-invite-join", 10);
    const parsed = joinBodySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    }

    const tokenHash = createHash("sha256").update(parsed.data.inviteToken).digest("hex");
    const room = await consumeVideoCallInvite(tokenHash);
    if (!room) throw new ApiError("VIDEO_CALL_INVITE_INVALID", 404);

    const agent = await getCurrentAgent(request);
    const ticket = createRealtimeTicket({
      roomId: room.room_id,
      sessionId: room.session_id,
      role: agent ? "agent" : "guest",
      displayName: agent?.displayName ?? parsed.data.displayName,
      recordingConsent: parsed.data.recordingConsent,
    });
    return Response.json(
      {
        ticket,
        participantId: getRealtimeTicketParticipantId(ticket),
        roomId: room.room_id,
        role: agent ? "agent" : "guest",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
