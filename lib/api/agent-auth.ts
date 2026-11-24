import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "@/lib/api/http";
import {
  createAgentSession,
  deleteAgentSession,
  findAgentBySessionTokenHash,
} from "@/lib/repositories/chatbotAgents";

export const AGENT_SESSION_COOKIE = "urban_cruise_agent_session";

export function hashAgentSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function startAgentSession(agentId: number) {
  const token = randomBytes(32).toString("hex");
  await createAgentSession(hashAgentSessionToken(token), agentId);
  return token;
}

export function readAgentSessionToken(request: Request) {
  const prefix = `${AGENT_SESSION_COOKIE}=`;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  const token = cookie?.slice(prefix.length);
  return token && /^[a-f0-9]{64}$/i.test(token) ? token : null;
}

export function requireAgentRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new ApiError("INVALID_ORIGIN", 403);
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      throw new ApiError("INVALID_ORIGIN", 403);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("INVALID_ORIGIN", 403);
  }
}

export async function getCurrentAgent(request: Request) {
  const token = readAgentSessionToken(request);
  if (!token) return null;
  return findAgentBySessionTokenHash(hashAgentSessionToken(token));
}

export async function requireAgent(request: Request) {
  const agent = await getCurrentAgent(request);
  if (!agent) throw new ApiError("AGENT_UNAUTHENTICATED", 401);
  return agent;
}

export async function endAgentSession(request: Request) {
  const token = readAgentSessionToken(request);
  if (token) await deleteAgentSession(hashAgentSessionToken(token));
}

export function agentSessionCookie(token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AGENT_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
