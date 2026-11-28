import { apiError, readJson, validationError } from "@/lib/api/http";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { requireActiveVideoCallTicket } from "@/lib/api/video-call-ticket";
import { sanitizePlainText } from "@/lib/chat/sanitize";
import { createMessage } from "@/lib/repositories/chatbotMessages";
import { publishVideoCallEvent } from "@/lib/realtime";
import { z } from "zod";

const bodySchema = z.object({
  ticket: z.string().min(1),
  text: z.string().trim().min(1).max(1000),
}).strict();

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "video-call-chat", 60);
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const { claims, room } = await requireActiveVideoCallTicket(parsed.data.ticket);
    if (claims.role === "agent") return Response.json({ error: { code: "AGENT_AUTH_REQUIRED" } }, { status: 401 });

    const cleanText = sanitizePlainText(parsed.data.text, 1000);
    if (!cleanText) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    const text = claims.role === "guest" ? `${claims.displayName}: ${cleanText}` : cleanText;
    const messageId = await createMessage({
      sessionId: room.session_id,
      messageType: "user",
      body: text,
    });
    const message = {
      id: String(messageId),
      author: "user" as const,
      text,
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
