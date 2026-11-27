import { ApiError, apiError, readJson, validationError } from "@/lib/api/http";
import { requireSession } from "@/lib/api/session-auth";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { videoCallRequestSchema } from "@/lib/chat/schemas";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "video-call-requests", 10);
    const parsed = videoCallRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    await requireSession(parsed.data.sessionToken);

    const realtimeUrl = (process.env.CHATBOT_REALTIME_URL || "http://127.0.0.1:5002").replace(/\/$/, "");
    const secret = process.env.CHATBOT_REALTIME_SECRET;
    if (!secret) throw new ApiError("REALTIME_UNAVAILABLE", 503);

    const realtimeRes = await fetch(`${realtimeUrl}/internal/publish`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`
      },
      body: JSON.stringify({
        kind: "video_request",
        payload: {
          sessionId: parsed.data.sessionToken,
          name: parsed.data.name,
          email: parsed.data.email,
        },
      })
    });

    if (!realtimeRes.ok) {
      throw new ApiError("REALTIME_UNAVAILABLE", 503);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}