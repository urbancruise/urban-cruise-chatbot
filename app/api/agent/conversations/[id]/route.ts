import { apiError, ApiError, readJson, validationError } from "@/lib/api/http";
import { requireAgent, requireAgentRequestOrigin } from "@/lib/api/agent-auth";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import {
  agentConversationStatusSchema,
  agentReplySchema,
  faqIdSchema,
} from "@/lib/chat/schemas";
import { createAuditLog } from "@/lib/repositories/chatbotAuditLogs";
import { createMessage } from "@/lib/repositories/chatbotMessages";
import { getCurrentServiceMode } from "@/lib/chat/business-hours";
import {
  assignConversationToAgent,
  closeAgentConversation,
  findAgentConversation,
  listAgentConversationMessages,
} from "@/lib/repositories/chatbotAgents";
import { publishRealtimeEvent } from "@/lib/realtime";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "agent-conversation-read", 60);
    const agent = await requireAgent(request);
    const { id } = await params;
    const parsedId = faqIdSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);
    const conversation = await findAgentConversation(parsedId.data);
    if (!canAccessConversation(conversation, agent.id)) {
      throw new ApiError("CONVERSATION_NOT_FOUND", 404);
    }

    return Response.json(
      { messages: await listAgentConversationMessages(parsedId.data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    requireAgentRequestOrigin(request);
    enforceRateLimit(request, "agent-replies", 60);
    const agent = await requireAgent(request);
    if ((await getCurrentServiceMode()) !== "day") {
      throw new ApiError("AGENT_SUPPORT_CLOSED", 409);
    }
    const { id } = await params;
    const parsedId = faqIdSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsedBody = agentReplySchema.safeParse(await readJson(request));
    if (!parsedBody.success) return validationError(parsedBody.error);
    const conversation = await findAgentConversation(parsedId.data);
    if (!canAccessConversation(conversation, agent.id)) {
      throw new ApiError("CONVERSATION_NOT_FOUND", 404);
    }
    if (!(await assignConversationToAgent(parsedId.data, agent.id))) {
      throw new ApiError("CONVERSATION_ASSIGNED", 409);
    }

    const messageId = await createMessage({
      sessionId: parsedId.data,
      messageType: "agent",
      body: parsedBody.data.text,
    });
    await createAuditLog("agent_message_sent", parsedId.data, {
      agentId: agent.id,
      messageId,
    });
    await publishRealtimeEvent(parsedId.data, "message", messageId);

    return Response.json(
      {
        message: {
          id: String(messageId),
          author: "agent",
          text: parsedBody.data.text,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    requireAgentRequestOrigin(request);
    enforceRateLimit(request, "agent-conversation-close", 60);
    const agent = await requireAgent(request);
    const { id } = await params;
    const parsedId = faqIdSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsedBody = agentConversationStatusSchema.safeParse(await readJson(request));
    if (!parsedBody.success) return validationError(parsedBody.error);
    const conversation = await findAgentConversation(parsedId.data);
    if (!canAccessConversation(conversation, agent.id)) {
      throw new ApiError("CONVERSATION_NOT_FOUND", 404);
    }
    if (!(await closeAgentConversation(parsedId.data, agent.id))) {
      throw new ApiError("CONVERSATION_ASSIGNED", 409);
    }
    await createAuditLog("agent_conversation_closed", parsedId.data, { agentId: agent.id });
    await publishRealtimeEvent(parsedId.data, "status");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

function canAccessConversation(
  conversation: Awaited<ReturnType<typeof findAgentConversation>>,
  agentId: number,
) {
  return Boolean(
    conversation &&
    (conversation.agent_chat_status === "waiting" || conversation.agent_chat_status === "active") &&
    conversation.assigned_cms_user_id === null &&
    (conversation.assigned_agent_id === null || conversation.assigned_agent_id === agentId),
  );
}
