import { randomBytes } from "node:crypto";
import { apiError, readJson, validationError } from "@/lib/api/http";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { sessionSchema } from "@/lib/chat/schemas";
import { getCurrentServiceMode } from "@/lib/chat/business-hours";
import { hashSessionToken } from "@/lib/api/session-auth";
import { createSession } from "@/lib/repositories/chatbotSessions";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "sessions", 15);
    const parsed = sessionSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);

    const token = randomBytes(32).toString("hex");
    const mode = await getCurrentServiceMode();
    const sessionId = await createSession(
      hashSessionToken(token),
      parsed.data.languageCode,
      mode,
    );

    return Response.json(
      { sessionId: String(sessionId), sessionToken: token, mode },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
