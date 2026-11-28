import type { ResultSetHeader } from "mysql2/promise";
import { db, type DbRow } from "@/lib/db";

export interface ChatAgent extends DbRow {
  id: number;
  username: string;
  displayName: string;
}

export interface AgentConversation extends DbRow {
  id: number;
  location_slug: string;
  agent_chat_status: "waiting" | "active";
  assigned_agent_id: number | null;
  assigned_agent_name: string | null;
  last_message: string | null;
  last_message_type: "user" | "assistant" | "agent" | null;
  last_activity_at: string;
}

export interface AgentConversationStatus extends DbRow {
  id: number;
  agent_chat_status: "none" | "waiting" | "active" | "closed";
  assigned_agent_id: number | null;
  assigned_cms_user_id: number | null;
}

export async function findAgentByUsername(username: string) {
  const [rows] = await db.execute<Array<ChatAgent & {
    password_salt: string;
    password_hash: string;
  }>>(
    `SELECT id, username, display_name AS displayName, password_salt, password_hash
     FROM chatbot_agents WHERE username = ? AND status = 'active' LIMIT 1`,
    [username],
  );
  return rows[0] ?? null;
}

export async function createAgentSession(tokenHash: string, agentId: number) {
  await db.execute(
    `INSERT INTO chatbot_agent_sessions (token_hash, agent_id, expires_at)
     VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))`,
    [tokenHash, agentId],
  );
}

export async function findAgentBySessionTokenHash(tokenHash: string) {
  const [rows] = await db.execute<ChatAgent[]>(
    `SELECT a.id, a.username, a.display_name AS displayName
     FROM chatbot_agent_sessions s
     JOIN chatbot_agents a ON a.id = s.agent_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND a.status = 'active'
     LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function deleteAgentSession(tokenHash: string) {
  await db.execute("DELETE FROM chatbot_agent_sessions WHERE token_hash = ?", [tokenHash]);
}

export async function deleteExpiredAgentSessions() {
  await db.execute("DELETE FROM chatbot_agent_sessions WHERE expires_at <= UTC_TIMESTAMP()");
}

export async function listAgentConversations(agentId: number, locationSlug?: string) {
  const locationFilter = locationSlug ? "AND s.location_slug = ?" : "";
  const parameters = locationSlug ? [agentId, locationSlug] : [agentId];
  const [rows] = await db.execute<AgentConversation[]>(
    `SELECT s.id, s.location_slug, s.agent_chat_status, s.assigned_agent_id, a.display_name AS assigned_agent_name,
       (SELECT m.body FROM chatbot_messages m WHERE m.session_id = s.id
        ORDER BY m.id DESC LIMIT 1) AS last_message,
       (SELECT m.message_type FROM chatbot_messages m WHERE m.session_id = s.id
        ORDER BY m.id DESC LIMIT 1) AS last_message_type,
       s.last_activity_at
     FROM chatbot_sessions s
     LEFT JOIN chatbot_agents a ON a.id = s.assigned_agent_id
     WHERE s.status = 'active'
       AND s.agent_chat_status IN ('waiting', 'active')
       AND s.last_activity_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
       AND s.assigned_cms_user_id IS NULL
       AND (s.assigned_agent_id IS NULL OR s.assigned_agent_id = ?)
       ${locationFilter}
     ORDER BY (s.agent_chat_status = 'waiting') DESC, s.last_activity_at ASC`,
    parameters,
  );
  return rows;
}

export async function listAgentConversationLocationCounts(agentId: number) {
  const [rows] = await db.execute<Array<DbRow & {
    location_slug: string;
    conversation_count: number | string;
  }>>(
    `SELECT s.location_slug, COUNT(*) AS conversation_count
     FROM chatbot_sessions s
     WHERE s.status = 'active'
       AND s.agent_chat_status IN ('waiting', 'active')
       AND s.last_activity_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
       AND s.assigned_cms_user_id IS NULL
       AND (s.assigned_agent_id IS NULL OR s.assigned_agent_id = ?)
     GROUP BY s.location_slug
     ORDER BY s.location_slug`,
    [agentId],
  );
  return rows.map((row) => ({
    location_slug: row.location_slug,
    conversation_count: Number(row.conversation_count),
  }));
}

export async function findAgentConversation(sessionId: number) {
  const [rows] = await db.execute<AgentConversationStatus[]>(
    `SELECT id, agent_chat_status, assigned_agent_id, assigned_cms_user_id
     FROM chatbot_sessions WHERE id = ? AND status = 'active' LIMIT 1`,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function listAgentConversationMessages(sessionId: number) {
  const [rows] = await db.execute<Array<DbRow & {
    id: number;
    message_type: "user" | "assistant" | "agent";
    body: string;
    created_at: string;
  }>>(
    `SELECT id, message_type, body, created_at
     FROM chatbot_messages
     WHERE session_id = ?
       AND message_type IN ('user', 'assistant', 'agent')
       AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
     ORDER BY id`,
    [sessionId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    author: row.message_type,
    text: row.body,
    createdAt: row.created_at,
  }));
}

export async function queueConversationForAgent(sessionId: number) {
  await db.execute(
    `UPDATE chatbot_sessions
     SET assigned_agent_id = IF(agent_chat_status IN ('none', 'closed'), NULL, assigned_agent_id),
         assigned_cms_user_id = IF(agent_chat_status IN ('none', 'closed'), NULL, assigned_cms_user_id),
         agent_chat_status = IF(agent_chat_status IN ('none', 'closed'), 'waiting', agent_chat_status)
     WHERE id = ? AND status = 'active'`,
    [sessionId],
  );
  return findAgentConversation(sessionId);
}

export async function assignConversationToAgent(sessionId: number, agentId: number) {
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE chatbot_sessions
     SET assigned_agent_id = COALESCE(assigned_agent_id, ?),
         agent_chat_status = 'active',
         last_activity_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'active'
       AND agent_chat_status IN ('waiting', 'active')
       AND assigned_cms_user_id IS NULL
       AND (assigned_agent_id IS NULL OR assigned_agent_id = ?)`,
    [agentId, sessionId, agentId],
  );
  return result.affectedRows === 1;
}

export async function closeAgentConversation(sessionId: number, agentId: number) {
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE chatbot_sessions
     SET agent_chat_status = 'closed', assigned_agent_id = NULL
     WHERE id = ? AND status = 'active' AND agent_chat_status IN ('waiting', 'active')
       AND assigned_cms_user_id IS NULL
       AND (assigned_agent_id IS NULL OR assigned_agent_id = ?)`,
    [sessionId, agentId],
  );
  return result.affectedRows === 1;
}
