import { connection } from "next/server";
import { apiError, validationError } from "@/lib/api/http";
import { requireAgent } from "@/lib/api/agent-auth";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { agentConversationLocationSchema } from "@/lib/chat/schemas";
import {
  listAgentConversationLocationCounts,
  listAgentConversations,
} from "@/lib/repositories/chatbotAgents";

export async function GET(request: Request) {
  await connection();
  try {
    enforceRateLimit(request, "agent-conversations", 60);
    const agent = await requireAgent(request);
    const rawLocation = new URL(request.url).searchParams.get("location") ?? "all";
    const parsedLocation = agentConversationLocationSchema.safeParse(rawLocation);
    if (!parsedLocation.success) return validationError(parsedLocation.error);

    const locationSlug = parsedLocation.data === "all" ? undefined : parsedLocation.data;
    const [conversations, locationCounts] = await Promise.all([
      listAgentConversations(agent.id, locationSlug),
      listAgentConversationLocationCounts(agent.id),
    ]);
    return Response.json(
      { conversations, locationCounts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
