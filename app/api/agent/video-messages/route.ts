import { apiError, ApiError, readJson, validationError } from "@/lib/api/http";
import { requireAgent, requireAgentRequestOrigin } from "@/lib/api/agent-auth";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { requireActiveVideoCallTicket } from "@/lib/api/video-call-ticket";
import { createMessage } from "@/lib/repositories/chatbotMessages";
import { publishVideoCallEvent } from "@/lib/realtime";
import { agentReplySchema } from "@/lib/chat/schemas";
import { z } from "zod";

const bodySchema = z.object({
  ticket: z.string().min(1),
  text: agentReplySchema.shape.text,
}).strict();

export async function POST(request: Request) {
  try {
    requireAgentRequestOrigin(request);
    enforceRateLimit(request, "agent-video-call-chat", 60);
    await requireAgent(request);
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const { claims, room } = await requireActiveVideoCallTicket(parsed.data.ticket);
    if (claims.role !== "agent") throw new ApiError("VIDEO_CALL_UNAUTHORIZED", 401);

    const messageId = await createMessage({
      sessionId: room.session_id,
      messageType: "agent",
      body: parsed.data.text,
    });
    const message = {
      id: String(messageId),
      author: "agent" as const,
      text: parsed.data.text,
      createdAt: new Date().toISOString(),
    };
    const delivered = await publishVideoCallEvent(room.room_id, "call_chat", message);
    if (!delivered) {
      return Response.json({ error: { code: "MESSAGE_SAVED_LIVE_DELIVERY_FAILED" } }, { status: 503 });
    }
    return Response.json({ message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
