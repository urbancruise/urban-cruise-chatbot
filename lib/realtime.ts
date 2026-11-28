let missingPublisherConfigReported = false;

export async function publishRealtimeEvent(
  sessionId: number,
  kind: "message" | "status",
  messageId?: number,
) {
  const secret = process.env.CHATBOT_REALTIME_SECRET;
  if (!secret) {
    if (!missingPublisherConfigReported) {
      console.error("[chat-realtime] Set CHATBOT_REALTIME_SECRET to publish live events.");
      missingPublisherConfigReported = true;
    }
    return false;
  }

  const baseUrl = process.env.CHATBOT_REALTIME_URL || "http://127.0.0.1:5002";
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId, kind, messageId }),
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      console.error(`[chat-realtime] Event publish failed with HTTP ${response.status}.`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[chat-realtime] Realtime service is unavailable.", error);
    return false;
  }
}

export async function publishVideoCallEvent(
  roomId: string,
  kind: "call_chat" | "call_ended",
  message?: { id: string; author: "user" | "agent"; text: string; createdAt: string },
) {
  const secret = process.env.CHATBOT_REALTIME_SECRET;
  if (!secret) {
    console.error("[chat-realtime] Set CHATBOT_REALTIME_SECRET to publish video-call events.");
    return false;
  }

  const baseUrl = process.env.CHATBOT_REALTIME_URL || "http://127.0.0.1:5002";
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        kind === "call_chat"
          ? { kind, payload: { roomId, message } }
          : { kind, roomId },
      ),
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      console.error(`[chat-realtime] Video-call event publish failed with HTTP ${response.status}.`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[chat-realtime] Realtime service is unavailable.", error);
    return false;
  }
}
