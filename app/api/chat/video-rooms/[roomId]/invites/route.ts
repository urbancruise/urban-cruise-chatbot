import { createHash, randomBytes } from "node:crypto";
import { apiError, ApiError, readJson } from "@/lib/api/http";
import { requireActiveVideoCallTicket } from "@/lib/api/video-call-ticket";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { createVideoCallInvite } from "@/lib/repositories/chatbotVideoRooms";
import { z } from "zod";

type RouteContext = { params: Promise<{ roomId: string }> };
const inviteBodySchema = z.object({ ticket: z.string().min(1) }).strict();
const roomIdSchema = z.string().uuid();

export async function POST(request: Request, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "video-call-invite", 20);
    const parsedBody = inviteBodySchema.safeParse(await readJson(request));
    if (!parsedBody.success) {
      return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    }

    const { roomId: rawRoomId } = await params;
    const roomIdParsed = roomIdSchema.safeParse(rawRoomId);
    if (!roomIdParsed.success) throw new ApiError("VIDEO_CALL_NOT_FOUND", 404);
    await requireActiveVideoCallTicket(parsedBody.data.ticket, roomIdParsed.data);

    const inviteToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
    const created = await createVideoCallInvite(roomIdParsed.data, tokenHash);
    if (!created) throw new ApiError("VIDEO_CALL_NOT_FOUND", 404);
    const baseUrl = process.env.APP_BASE_URL || new URL(request.url).origin;
    const inviteUrl = new URL(`/video-call/invite/${inviteToken}`, baseUrl).toString();
    return Response.json({ inviteUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
