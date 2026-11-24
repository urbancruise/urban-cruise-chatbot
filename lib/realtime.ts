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
