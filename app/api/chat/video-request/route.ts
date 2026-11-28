import { randomBytes } from "node:crypto";
import { ApiError, apiError, readJson, validationError } from "@/lib/api/http";
import { hashSessionToken, requireSession } from "@/lib/api/session-auth";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { videoCallRequestSchema } from "@/lib/chat/schemas";
import {
  assertSmtpConfigured,
  createVideoCallJoinUrl,
  sendScheduledVideoCallEmail,
} from "@/lib/email/scheduledVideoCall";
import { createSession } from "@/lib/repositories/chatbotSessions";
import { createScheduledVideoCall } from "@/lib/repositories/chatbotVideoCalls";
import { createVideoCallRoom } from "@/lib/repositories/chatbotVideoRooms";
import { createRealtimeTicket, getRealtimeTicketParticipantId } from "@/lib/realtime/tickets";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "video-call-requests", 10);
    const parsed = videoCallRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const session = await requireSession(parsed.data.sessionToken);
    let callSessionToken = parsed.data.sessionToken;
    let callSessionId = session.id;
    let emailConfig: ReturnType<typeof assertSmtpConfigured> | null = null;
    let joinUrl = "";
    let roomId: string | undefined;
    let customerTicket: string | undefined;

    if (parsed.data.scheduledAt && parsed.data.timeZone) {
      emailConfig = assertSmtpConfigured();
      const appBaseUrl = process.env.APP_BASE_URL;
      if (!appBaseUrl) throw new ApiError("EMAIL_UNAVAILABLE", 503);
      callSessionToken = randomBytes(32).toString("hex");
      joinUrl = createVideoCallJoinUrl(appBaseUrl, callSessionToken);
      callSessionId = await createSession(
        hashSessionToken(callSessionToken),
        session.language_code,
        session.service_mode,
        session.location_slug,
      );
      await createScheduledVideoCall({
        sessionId: callSessionId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        scheduledAt: parsed.data.scheduledAt,
        timeZone: parsed.data.timeZone,
      });
    } else {
      roomId = await createVideoCallRoom(session.id);
      customerTicket = createRealtimeTicket({
        roomId,
        sessionId: session.id,
        role: "customer",
        displayName: parsed.data.name,
        recordingConsent: parsed.data.allowAgentRecording,
      });
    }

    if (emailConfig && parsed.data.scheduledAt && parsed.data.timeZone) {
      await sendScheduledVideoCallEmail(emailConfig, {
        to: parsed.data.email,
        name: parsed.data.name,
        scheduledAt: parsed.data.scheduledAt,
        timeZone: parsed.data.timeZone,
        joinUrl,
      });
    }

    const agentNotificationSent = await notifyAgent({
      sessionId: callSessionId,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      scheduledAt: parsed.data.scheduledAt,
      roomId,
    });
    if (!agentNotificationSent && !emailConfig) {
      throw new ApiError("REALTIME_UNAVAILABLE", 503);
    }

    return Response.json({
      ok: true,
      emailSent: Boolean(emailConfig),
      agentNotificationSent,
      roomId,
      ticket: customerTicket,
      participantId: customerTicket ? getRealtimeTicketParticipantId(customerTicket) : undefined,
    });
  } catch (error) {
    return apiError(error);
  }
}

async function notifyAgent(payload: {
  sessionId: number;
  name: string;
  email: string;
  phone: string;
  scheduledAt?: string;
  roomId?: string;
}) {
  const secret = process.env.CHATBOT_REALTIME_SECRET;
  if (!secret) {
    console.error("CHATBOT_REALTIME_SECRET is missing; the agent was not notified.");
    return false;
  }

  const realtimeUrl = (process.env.CHATBOT_REALTIME_URL || "http://127.0.0.1:5002").replace(/\/$/, "");
  try {
    const response = await fetch(`${realtimeUrl}/internal/publish`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`,
      },
      body: JSON.stringify({ kind: "video_request", payload }),
    });
    if (response.ok) return true;
    console.error(`Video-call request was not published to the agent queue (HTTP ${response.status}).`);
    return false;
  } catch (error) {
    console.error("Could not publish the video-call request to the agent queue.", error);
    return false;
  }
}