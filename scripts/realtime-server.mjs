import { createServer } from "node:http";
import { Server } from "socket.io";
import { hasValidPublishSecret } from "./realtime-auth.mjs";

const port = Number(process.env.CHATBOT_REALTIME_PORT || 5002);
const secret = process.env.CHATBOT_REALTIME_SECRET || "your-secret-key";
const allowedOrigins = new Set(["http://localhost:5001", "http://localhost:3000", "http://127.0.0.1:5001"]);

const httpServer = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/internal/publish") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        if (!hasValidPublishSecret(req.headers.authorization, secret)) {
          res.writeHead(401); return res.end("Unauthorized");
        }

        const parsed = JSON.parse(body);
        if (parsed.kind === "video_request") {
          console.log("Sending video-call request to the agent queue.");
          io.to("agents:queue").emit("video:incoming", parsed.payload);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400); res.end();
      }
    });
  } else {
    res.writeHead(404); res.end();
  }
});

const io = new Server(httpServer, {
  cors: { origin: [...allowedOrigins] },
});

io.on("connection", (socket) => {
  const auth = socket.handshake.auth;

  // AGENT CONNECTION
  if (auth.standaloneAgent || socket.handshake.headers.cookie?.includes("urban_cruise_agent_session")) {
    console.log("✅ Agent connected to Socket.IO queue");
    socket.join("agents:queue");

    socket.on("video:accept", (data) => {
      io.to(`customer:${data.sessionId}`).emit("video:accept");
    });
    socket.on("video:answer", (data) => {
      io.to(`customer:${data.sessionId}`).emit("video:answer", { answer: data.answer });
    });
    socket.on("video:ice-candidate", (data) => {
      io.to(`customer:${data.sessionId}`).emit("video:ice-candidate", { candidate: data.candidate });
    });
  }
  // CUSTOMER CONNECTION
  else if (auth.sessionToken) {
    console.log("👤 Customer connected:", auth.sessionToken);
    socket.join(`customer:${auth.sessionToken}`);

    socket.on("video:offer", (data) => {
      io.to("agents:queue").emit("video:offer", { sessionId: auth.sessionToken, offer: data.offer });
    });
    socket.on("video:ice-candidate", (data) => {
      io.to("agents:queue").emit("video:ice-candidate", { sessionId: auth.sessionToken, candidate: data.candidate });
    });
  }
});

httpServer.listen(port, () => console.log(`🚀 Realtime server running on port ${port}`));