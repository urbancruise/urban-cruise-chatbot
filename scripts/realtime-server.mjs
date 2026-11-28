import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { hasValidPublishSecret } from "./realtime-auth.mjs";
import { canStartRecordingWithoutPrompt } from "./realtime-recording-consent.mjs";

const port = Number(process.env.CHATBOT_REALTIME_PORT || 5002);
const secret = process.env.CHATBOT_REALTIME_SECRET;
const allowedOrigins = new Set([
  "http://localhost:5001",
  "http://localhost:3000",
  "http://127.0.0.1:5001",
  ...(process.env.CHATBOT_REALTIME_ALLOWED_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean),
]);
const recordings = new Map();
let io;

const httpServer = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/internal/publish") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 16_384) {
        res.writeHead(413);
        res.end();
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        if (!secret || !hasValidPublishSecret(req.headers.authorization, secret)) {
          res.writeHead(401);
          return res.end("Unauthorized");
        }

        const parsed = JSON.parse(body);
        if (parsed.kind === "video_request" && parsed.payload?.roomId) {
          io.to("agents:queue").emit("video:incoming", parsed.payload);
        } else if (parsed.kind === "call_chat" && parsed.payload?.roomId && parsed.payload?.message) {
          io.to(`call:${parsed.payload.roomId}`).emit("call:chat", parsed.payload.message);
        } else if (parsed.kind === "call_ended" && parsed.roomId) {
          io.to(`call:${parsed.roomId}`).emit("call:ended");
        } else if (parsed.kind === "message" || parsed.kind === "status") {
          io.to(`customer:${parsed.sessionId}`).emit("chat:update", { kind: parsed.kind, messageId: parsed.messageId });
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

io = new Server(httpServer, {
  cors: { origin: [...allowedOrigins] },
});

io.use((socket, next) => {
  const claims = verifyTicket(socket.handshake.auth?.ticket);
  if (claims) {
    socket.data.callClaims = claims;
    return next();
  }
  const sessionToken = socket.handshake.auth?.sessionToken;
  if (typeof sessionToken === "string" && /^[a-f0-9]{64}$/i.test(sessionToken)) {
    socket.data.chatSessionToken = sessionToken;
    return next();
  }
  next(new Error("UNAUTHORIZED"));
});

io.on("connection", (socket) => {
  if (socket.data.chatSessionToken) {
    socket.join(`customer:${socket.data.chatSessionToken}`);
    return;
  }
  const claims = socket.data.callClaims;
  if (claims.roomId === "agent-queue" && claims.role === "agent") {
    socket.join("agents:queue");
    return;
  }
  if (claims.role === "customer") socket.join(`customer:${claims.sessionId}`);

  socket.on("call:join", async () => {
    const roomName = `call:${claims.roomId}`;
    const currentPeers = await io.in(roomName).fetchSockets();
    if (currentPeers.some(peer => peer.data.callClaims.participantId === claims.participantId)) return;
    if (currentPeers.length >= 5) {
      socket.emit("call:error", { code: "CALL_FULL" });
      return;
    }

    socket.join(roomName);
    const participant = toParticipant(claims);
    const participants = currentPeers.map(peer => toParticipant(peer.data.callClaims));
    socket.emit("call:participants", participants);
    socket.to(roomName).emit("call:participant-joined", participant);
    const recording = recordings.get(claims.roomId);
    if (recording) {
      recordings.delete(claims.roomId);
      io.to(roomName).emit("call:recording-stopped", { reason: "A new participant joined." });
    }
  });

  socket.on("rtc:offer", (data) => { void relayToPeer(socket, "rtc:offer", data); });
  socket.on("rtc:answer", (data) => { void relayToPeer(socket, "rtc:answer", data); });
  socket.on("rtc:ice", (data) => { void relayToPeer(socket, "rtc:ice", data); });

  socket.on("call:recording-request", async (data) => {
    const roomName = `call:${claims.roomId}`;
    const peers = await io.in(roomName).fetchSockets();
    if (peers.length < 2 || peers.length > 5 || recordings.has(claims.roomId)) return;
    if (typeof data?.requestId !== "string" || data.requestId.length > 80) return;
    const participantIds = new Set(peers.map(peer => peer.data.callClaims.participantId));
    if (!participantIds.has(claims.participantId)) return;
    if (claims.role === "agent") {
      const participants = peers.map(peer => toRecordingParticipant(peer.data.callClaims));
      const requester = participants.find(participant => participant.participantId === claims.participantId);
      if (!requester || !canStartRecordingWithoutPrompt(requester, participants)) {
        socket.emit("call:recording-blocked", {
          reason: "Everyone else must opt in before the call to allow agent recording.",
        });
        return;
      }

      recordings.set(claims.roomId, {
        requestId: data.requestId,
        requesterId: claims.participantId,
        participantIds,
        approvals: new Set(participantIds),
        active: true,
      });
      io.to(roomName).emit("call:recording-approved", { requestId: data.requestId });
      return;
    }

    recordings.set(claims.roomId, {
      requestId: data.requestId,
      requesterId: claims.participantId,
      participantIds,
      approvals: new Set([claims.participantId]),
    });
    socket.to(roomName).emit("call:recording-request", {
      requestId: data.requestId,
      requesterName: claims.displayName,
    });
  });

  socket.on("call:recording-consent", async (data) => {
    const recording = recordings.get(claims.roomId);
    if (!recording || recording.requestId !== data?.requestId || !recording.participantIds.has(claims.participantId)) return;
    if (data.accepted !== true) {
      recordings.delete(claims.roomId);
      io.to(`call:${claims.roomId}`).emit("call:recording-denied");
      return;
    }
    recording.approvals.add(claims.participantId);
    if ([...recording.participantIds].every(id => recording.approvals.has(id))) {
      recordings.set(claims.roomId, { ...recording, active: true });
      io.to(`call:${claims.roomId}`).emit("call:recording-approved", { requestId: recording.requestId });
    }
  });

  socket.on("call:recording-stop", () => {
    const recording = recordings.get(claims.roomId);
    if (!recording) return;
    recordings.delete(claims.roomId);
    io.to(`call:${claims.roomId}`).emit(recording.active ? "call:recording-stopped" : "call:recording-denied");
  });

  socket.on("call:end", () => {
    recordings.delete(claims.roomId);
    io.to(`call:${claims.roomId}`).emit("call:ended");
  });

  socket.on("disconnect", () => {
    const recording = recordings.get(claims.roomId);
    recordings.delete(claims.roomId);
    socket.to(`call:${claims.roomId}`).emit("call:participant-left", {
      participantId: claims.participantId,
    });
    if (recording) {
      socket.to(`call:${claims.roomId}`).emit(
        recording.active ? "call:recording-stopped" : "call:recording-denied",
        recording.active ? { reason: "A participant left the call." } : undefined,
      );
    }
  });
});

async function relayToPeer(socket, eventName, data) {
  const claims = socket.data.callClaims;
  if (typeof data?.targetId !== "string") return;
  const peers = await io.in(`call:${claims.roomId}`).fetchSockets();
  const target = peers.find(peer => peer.data.callClaims.participantId === data.targetId);
  if (!target) return;
  target.emit(eventName, {
    ...data,
    senderId: claims.participantId,
  });
}

function toParticipant(claims) {
  return {
    participantId: claims.participantId,
    role: claims.role,
    displayName: claims.displayName,
  };
}

function toRecordingParticipant(claims) {
  return {
    ...toParticipant(claims),
    recordingConsent: claims.recordingConsent === true,
  };
}

function verifyTicket(ticket) {
  if (!secret || typeof ticket !== "string") return null;
  const [encodedPayload, signature, extra] = ticket.split(".");
  if (!encodedPayload || !signature || extra || !/^[a-f0-9]{64}$/i.test(signature)) return null;
  const expected = createHmac("sha256", secret).update(encodedPayload).digest();
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (
      typeof claims.roomId !== "string" ||
      typeof claims.sessionId !== "number" ||
      typeof claims.participantId !== "string" ||
      !["customer", "agent", "guest"].includes(claims.role) ||
      typeof claims.displayName !== "string" ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    if (claims.roomId === "agent-queue" && claims.role !== "agent") return null;
    return claims;
  } catch {
    return null;
  }
}

httpServer.listen(port, () => {
  if (!secret) console.error("CHATBOT_REALTIME_SECRET is missing; socket authentication is disabled.");
  console.log(`Realtime server running on port ${port}`);
});
