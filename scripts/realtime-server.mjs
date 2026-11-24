import { createServer } from "node:http";
import mysql from "mysql2/promise";
import { Server } from "socket.io";
import { z } from "zod";
import {
  hasValidPublishSecret,
  hashCustomerToken,
  verifyCmsTicket as verifyCmsRealtimeTicket,
} from "./realtime-auth.mjs";

const port = Number(process.env.CHATBOT_REALTIME_PORT || 5002);
const secret = required("CHATBOT_REALTIME_SECRET");
if (Buffer.byteLength(secret) < 32) {
  throw new Error("CHATBOT_REALTIME_SECRET must contain at least 32 bytes.");
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("CHATBOT_REALTIME_PORT must be an integer from 1 to 65535.");
}
const localOrigins = [
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5001",
];
const configuredOrigins = process.env.CHATBOT_REALTIME_ALLOWED_ORIGINS;
if (process.env.NODE_ENV === "production" && !configuredOrigins) {
  throw new Error("CHATBOT_REALTIME_ALLOWED_ORIGINS must be configured in production.");
}
const allowedOrigins = new Set();
for (const origin of (configuredOrigins || localOrigins.join(",")).split(",")) {
  const normalizedOrigin = origin.trim();
  if (!normalizedOrigin) continue;
  const parsedOrigin = new URL(normalizedOrigin);
  if (
    parsedOrigin.origin !== normalizedOrigin ||
    !["http:", "https:"].includes(parsedOrigin.protocol) ||
    (process.env.NODE_ENV === "production" && parsedOrigin.protocol !== "https:")
  ) {
    throw new Error(`Invalid realtime browser origin: ${normalizedOrigin}`);
  }
  allowedOrigins.add(normalizedOrigin);
}

const pool = mysql.createPool({
  host: required("DB_HOST"),
  port: Number(process.env.DB_PORT || 3306),
  user: required("DB_USER"),
  password: required("DB_PASSWORD"),
  database: required("DB_NAME"),
  charset: "utf8mb4",
  timezone: "Z",
  dateStrings: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  waitForConnections: true,
  queueLimit: 0,
});

const eventSchema = z.object({
  sessionId: z.number().int().positive().safe(),
  kind: z.enum(["message", "status"]),
  messageId: z.number().int().positive().safe().optional(),
}).strict().refine((event) => event.kind !== "message" || event.messageId !== undefined);
const typingSchema = z.object({
  sessionId: z.number().int().positive().safe(),
  typing: z.boolean(),
}).strict();

const httpServer = createServer((request, response) => {
  void handleHttpRequest(request, response).catch((error) => {
    console.error("[chat-realtime] HTTP handler failed", error);
    respond(response, 500, { error: "Internal server error" });
  });
});

const io = new Server(httpServer, {
  cors: {
    origin: [...allowedOrigins],
    methods: ["GET", "POST"],
  },
  allowRequest(request, callback) {
    const origin = request.headers.origin;
    callback(null, typeof origin === "string" && allowedOrigins.has(origin));
  },
  maxHttpBufferSize: 16_384,
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

io.use(async (socket, next) => {
  try {
    const auth = socket.handshake.auth || {};
    if (typeof auth.sessionToken === "string" && !auth.cmsTicket) {
      const session = await findCustomerSession(auth.sessionToken);
      if (!session) return next(new Error("Unauthorized"));
      socket.data.kind = "customer";
      socket.data.sessionId = Number(session.id);
      return next();
    }

    if (typeof auth.cmsTicket === "string" && !auth.sessionToken) {
      const user = await verifyCmsTicket(auth.cmsTicket);
      if (!user) return next(new Error("Unauthorized"));
      socket.data.kind = "cms-agent";
      socket.data.userId = user.id;
      return next();
    }

    next(new Error("Unauthorized"));
  } catch (error) {
    console.error("[chat-realtime] Socket authentication failed.", error);
    next(new Error("Authentication unavailable"));
  }
});

io.on("connection", (socket) => {
  if (socket.data.kind === "customer") {
    socket.join(customerRoom(socket.data.sessionId));
    socket.emit("realtime:ready", { role: "customer" });
    return;
  }

  socket.join("agents:queue");
  socket.join(agentRoom(socket.data.userId));
  socket.emit("realtime:ready", { role: "cms-agent" });
  const permissionTimer = setInterval(() => {
    void isCmsUserAuthorized(socket.data.userId)
      .then((authorized) => {
        if (!authorized) {
          socket.emit("realtime:access-revoked");
          socket.disconnect(true);
        }
      })
      .catch((error) => {
        console.error("[chat-realtime] Could not recheck CMS agent access.", error);
        socket.emit("realtime:reauthenticate");
        setTimeout(() => socket.disconnect(true), 500);
      });
  }, 30_000);
  socket.on("disconnect", () => clearInterval(permissionTimer));

  let lastTypingEventAt = 0;
  socket.on("agent:typing", (payload) => {
    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) return;
    const now = Date.now();
    if (now - lastTypingEventAt < 250) return;
    lastTypingEventAt = now;
    void forwardAgentTyping(socket.data.userId, parsed.data).catch((error) => {
      console.error("[chat-realtime] Could not forward agent typing status.", error);
    });
  });
});

httpServer.listen(port, process.env.CHATBOT_REALTIME_HOST || "0.0.0.0", () => {
  console.log(`[chat-realtime] listening on port ${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    io.close(() => {
      void pool.end().then(
        () => process.exit(0),
        (error) => {
          console.error("[chat-realtime] Could not close the database pool cleanly.", error);
          process.exit(1);
        },
      );
    });
  });
}

async function handleHttpRequest(request, response) {
  const url = new URL(request.url || "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/health") {
    respond(response, 200, { ok: true });
    return;
  }
  if (request.method !== "POST" || url.pathname !== "/internal/publish") {
    respond(response, 404, { error: "Not found" });
    return;
  }
  if (!hasValidPublishSecret(request.headers.authorization, secret)) {
    respond(response, 401, { error: "Unauthorized" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    respond(response, error instanceof PayloadTooLargeError ? 413 : 400, {
      error: error instanceof PayloadTooLargeError ? "Payload too large" : "Invalid JSON body",
    });
    return;
  }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    respond(response, 400, { error: "Invalid publish event" });
    return;
  }

  await publishSessionEvent(parsed.data.sessionId, parsed.data.kind, parsed.data.messageId);
  respond(response, 200, { ok: true });
}

async function findCustomerSession(token) {
  const tokenHash = hashCustomerToken(token);
  if (!tokenHash) return null;
  const [rows] = await pool.execute(
    `SELECT id FROM chatbot_sessions
     WHERE session_token_hash = ? AND status = 'active'
       AND last_activity_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
     LIMIT 1`,
    [tokenHash],
  );
  return rows[0] || null;
}

async function verifyCmsTicket(ticket) {
  const ticketData = verifyCmsRealtimeTicket(ticket, secret);
  if (ticketData === null) return null;

  const authorized = await isCmsUserAuthorized(ticketData.id);
  return authorized ? { id: ticketData.id } : null;
}

async function isCmsUserAuthorized(userId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.is_active, u.role,
       EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id AND r.is_active = 1
           AND JSON_CONTAINS(COALESCE(r.permissions, JSON_ARRAY()), JSON_QUOTE('chatbot.manage'))
       ) AS can_manage_chatbot,
       EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id AND r.is_active = 1 AND r.slug = 'admin'
       ) AS has_admin_role
     FROM users u WHERE u.id = ? LIMIT 1`,
    [userId],
  );
  const user = rows[0];
  if (!user || !user.is_active || (!user.can_manage_chatbot && user.role !== "admin" && !user.has_admin_role)) {
    return false;
  }
  return true;
}

async function publishSessionEvent(sessionId, kind, messageId) {
  const [sessions] = await pool.execute(
    `SELECT id, status, location_slug, agent_chat_status,
       assigned_agent_id, assigned_cms_user_id, last_activity_at
     FROM chatbot_sessions WHERE id = ? LIMIT 1`,
    [sessionId],
  );
  const session = sessions[0];
  if (!session) throw new Error(`Realtime publish references missing chat session ${sessionId}.`);

  let latestMessage = null;
  if (kind === "message") {
    const [messages] = await pool.execute(
      `SELECT id, message_type, body, created_at
       FROM chatbot_messages WHERE session_id = ? AND id = ? LIMIT 1`,
      [sessionId, messageId],
    );
    latestMessage = messages[0] || null;
    if (!latestMessage) throw new Error(`Realtime event references missing message ${messageId} for session ${sessionId}.`);
  }

  const assignedCmsUserId = session.assigned_cms_user_id === null
    ? null
    : Number(session.assigned_cms_user_id);
  const update = {
    sessionId: Number(session.id),
    status: session.agent_chat_status,
    locationSlug: session.location_slug,
    assignedCmsUserId,
    lastActivityAt: session.last_activity_at,
  };
  if (session.agent_chat_status !== "none") {
    io.to("agents:queue").emit("conversation:updated", update);
    if (assignedCmsUserId !== null) {
      io.to(agentRoom(assignedCmsUserId)).emit("conversation:updated", update);
    }
  }

  if (kind !== "message" || latestMessage.message_type !== "agent") return;
  const message = {
    id: String(latestMessage.id),
    author: "agent",
    text: latestMessage.body,
    createdAt: latestMessage.created_at,
  };
  io.to(customerRoom(sessionId)).emit("chat:agent-message", message);
  if (assignedCmsUserId !== null) {
    io.to(agentRoom(assignedCmsUserId)).emit("agent:message", {
      sessionId: Number(sessionId),
      message,
    });
  }
}

async function forwardAgentTyping(userId, input) {
  const [rows] = await pool.execute(
    `SELECT id FROM chatbot_sessions
     WHERE id = ? AND status = 'active'
       AND agent_chat_status IN ('waiting', 'active')
       AND assigned_agent_id IS NULL
       AND (assigned_cms_user_id IS NULL OR assigned_cms_user_id = ?)
     LIMIT 1`,
    [input.sessionId, userId],
  );
  if (rows[0]) {
    io.to(customerRoom(input.sessionId)).emit("agent:typing", { typing: input.typing });
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2048) throw new PayloadTooLargeError();
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

class PayloadTooLargeError extends Error {}

function respond(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function customerRoom(sessionId) {
  return `customer:${sessionId}`;
}

function agentRoom(userId) {
  return `cms-agent:${userId}`;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
