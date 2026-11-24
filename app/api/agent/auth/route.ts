import {
  agentSessionCookie,
  endAgentSession,
  getCurrentAgent,
  requireAgentRequestOrigin,
  startAgentSession,
} from "@/lib/api/agent-auth";
import { apiError, ApiError, readJson, validationError } from "@/lib/api/http";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { verifyAgentPassword } from "@/lib/agent/password";
import { agentLoginSchema } from "@/lib/chat/schemas";
import { createAuditLog } from "@/lib/repositories/chatbotAuditLogs";
import { deleteExpiredAgentSessions, findAgentByUsername } from "@/lib/repositories/chatbotAgents";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export async function GET(request: Request) {
  try {
    const agent = await getCurrentAgent(request);
    if (!agent) throw new ApiError("AGENT_UNAUTHENTICATED", 401);
    return Response.json(
      { agent: { id: String(agent.id), username: agent.username, displayName: agent.display_name } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireAgentRequestOrigin(request);
    enforceRateLimit(request, "agent-login", 5);
    const parsed = agentLoginSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const agent = await findAgentByUsername(parsed.data.username);
    if (!agent || !verifyAgentPassword(parsed.data.password, agent.password_salt, agent.password_hash)) {
      throw new ApiError("AGENT_LOGIN_FAILED", 401);
    }

    await deleteExpiredAgentSessions();
    const token = await startAgentSession(agent.id);
    await createAuditLog("agent_login", null, { agentId: agent.id });
    return Response.json(
      { agent: { id: String(agent.id), username: agent.username, displayName: agent.display_name } },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": agentSessionCookie(token, SESSION_MAX_AGE_SECONDS),
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireAgentRequestOrigin(request);
    await endAgentSession(request);
    return Response.json(
      { ok: true },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": agentSessionCookie("", 0),
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
