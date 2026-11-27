"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import { FaVideo, FaTimes } from "react-icons/fa";

interface Agent {
  id: string;
  username: string;
  displayName: string;
}

interface IncomingVideoCall {
  sessionId: string;
  name: string;
  email: string;
}

export default function AgentInbox() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [incomingVideoCall, setIncomingVideoCall] = useState<IncomingVideoCall | null>(null);
  const [inVideoCall, setInVideoCall] = useState(false);
  const currentSessionId = useRef<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const realtimeSocket = useRef<Socket | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/agent/auth", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Could not load agent session.");
        return response.json() as Promise<{ agent: Agent }>;
      })
      .then(data => { if (active && data) setAgent(data.agent); })
      .catch(error => {
        if (active) setAuthError(error instanceof Error ? error.message : "Could not load agent session.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSigningIn(true);
    setAuthError("");
    try {
      const response = await fetch("/api/agent/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json() as { agent?: Agent };
      if (!response.ok || !data.agent) {
        throw new Error(response.status === 401
          ? "Username or password is incorrect."
          : "Could not sign in. Please try again.");
      }
      setAgent(data.agent);
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setSigningIn(false);
    }
  };

  // Socket Connection Setup
  useEffect(() => {
    if (!agent) return;

    const realtimeUrl = process.env.NEXT_PUBLIC_CHAT_REALTIME_URL || "http://localhost:5002";
    const socket = io(realtimeUrl, {
      auth: { standaloneAgent: true },
      withCredentials: true,
      transports: ["websocket", "polling"]
    });

    realtimeSocket.current = socket;

    socket.on("connect", () => console.log("🔌 Socket Connected!"));
    socket.on("connect_error", (error) => console.error("Agent realtime connection failed:", error.message));

    // Popup Trigger
    socket.on("video:incoming", (data: IncomingVideoCall) => {
      console.log("Incoming video call received.");
      setIncomingVideoCall(data);
      currentSessionId.current = data.sessionId;
    });

    socket.on("video:ice-candidate", async (data: { sessionId: string; candidate: RTCIceCandidateInit }) => {
      if (currentSessionId.current !== data.sessionId) return;
      try {
        await peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (error) {
        console.error("Could not apply a video-call network candidate.", error);
      }
    });

    // WebRTC Offer Handling
    socket.on("video:offer", async ({ sessionId, offer }: { sessionId: string; offer: RTCSessionDescriptionInit }) => {
      if (currentSessionId.current !== sessionId) return;
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("video:answer", { sessionId, answer });
      } catch (error) {
        console.error("Could not answer the video-call offer.", error);
      }
    });

    return () => { socket.disconnect(); };
  }, [agent]);

  // Accept Call Button Logic
  const acceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) realtimeSocket.current?.emit("video:ice-candidate", { sessionId: currentSessionId.current, candidate: e.candidate });
      };

      pc.ontrack = (e) => {
        if (remoteVideoRef.current) {
           remoteVideoRef.current.srcObject = e.streams[0];
           const wait = document.getElementById("agent-wait");
           if (wait) wait.style.display = "none";
        }
      };

      realtimeSocket.current?.emit("video:accept", { sessionId: currentSessionId.current });

      setInVideoCall(true);
      setIncomingVideoCall(null);
    } catch {
      alert("Camera permission required.");
    }
  };

  const endVideoCall = () => {
    peerConnectionRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setInVideoCall(false);
    setIncomingVideoCall(null);
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  if (!agent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8f5] px-4 text-slate-950">
        <form onSubmit={signIn} className="w-full max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-xl font-bold">Urban Cruise agent sign in</h1>
            <p className="mt-1 text-sm text-slate-600">Sign in to receive video-call requests.</p>
          </div>
          {authError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{authError}</p>}
          <label className="block text-sm font-medium">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              minLength={12}
              required
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          <button type="submit" disabled={signingIn} className="w-full rounded-lg bg-[#03C35E] px-4 py-2 font-semibold text-white disabled:opacity-60">
            {signingIn ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-[#f7f8f5]">
      <header className="flex justify-between border-b bg-white p-4">
        <h1 className="font-bold">Urban Cruise Agent Inbox</h1>
        <span>{agent?.displayName}</span>
      </header>

      {/* INCOMING CALL POPUP */}
      {incomingVideoCall && !inVideoCall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 rounded-xl bg-white p-6 text-center shadow-2xl">
            <FaVideo className="mx-auto mb-4 h-12 w-12 animate-pulse text-green-500" />
            <h3 className="text-xl font-bold">Incoming Video Call</h3>
            <p className="mt-2 text-sm text-slate-600">{incomingVideoCall.name} is calling...</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => setIncomingVideoCall(null)} className="px-4 py-2 text-red-600">Decline</button>
              <button onClick={acceptCall} className="px-6 py-2 bg-green-600 text-white rounded-lg">Accept</button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE VIDEO CALL SCREEN */}
      {inVideoCall && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900 p-4">
          <div className="relative flex-1 bg-black rounded-xl overflow-hidden">
             <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
             <div id="agent-wait" className="absolute inset-0 flex items-center justify-center text-slate-400">Connecting Video...</div>
             <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-4 right-4 h-32 w-24 rounded-lg border-2 border-slate-700 bg-black object-cover" />
          </div>
          <div className="mt-4 flex justify-center">
            <button onClick={endVideoCall} className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white"><FaTimes /></button>
          </div>
        </div>
      )}

      <div className="grid flex-1 grid-cols-[300px_1fr]">
        <aside className="border-r bg-white p-4">
          <h2 className="font-bold">Conversations</h2>
        </aside>
        <section className="flex h-full items-center justify-center text-slate-500">
          Select a conversation
        </section>
      </div>
    </main>
  );
}