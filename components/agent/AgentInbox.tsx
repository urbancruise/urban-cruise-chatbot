"use client";

import { useEffect, useState, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import {
  FaArrowRight,
  FaCheckCircle,
  FaCircle,
  FaComments,
  FaHeadset,
  FaLock,
  FaRegClock,
  FaShieldAlt,
  FaTimes,
  FaVideo,
} from "react-icons/fa";
import VideoCallStage from "@/components/chat/VideoCallStage";
import type { VideoCallMessage } from "@/components/chat/VideoCallStage";

interface Agent {
  id: string;
  username: string;
  displayName: string;
}

interface IncomingVideoCall {
  sessionId: number;
  name: string;
  email: string;
  phone: string;
  scheduledAt?: string;
  roomId?: string;
}

type QueueConnection = "connecting" | "connected" | "disconnected" | "error";

export default function AgentInbox() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [queueConnection, setQueueConnection] = useState<QueueConnection>("connecting");
  const [queueError, setQueueError] = useState("");
  const [incomingVideoCall, setIncomingVideoCall] = useState<IncomingVideoCall | null>(null);
  const [acceptingCall, setAcceptingCall] = useState(false);
  const [callAcceptError, setCallAcceptError] = useState("");
  const [inVideoCall, setInVideoCall] = useState(false);
  const [callTicket, setCallTicket] = useState("");
  const [callParticipantId, setCallParticipantId] = useState("");
  const [callRoomId, setCallRoomId] = useState("");
  const [transcriptRoomId, setTranscriptRoomId] = useState("");
  const [callTranscript, setCallTranscript] = useState<VideoCallMessage[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState("");

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

  useEffect(() => {
    if (!agent) return;

    let active = true;
    let socket: Socket | null = null;
    void (async () => {
      try {
        const response = await fetch("/api/agent/video-realtime-ticket", {
          method: "POST",
          cache: "no-store",
        });
        const data = await response.json() as { ticket?: string };
        if (!response.ok || !data.ticket) throw new Error("Could not authenticate the agent call queue.");
        if (!active) return;

        socket = io(process.env.NEXT_PUBLIC_CHAT_REALTIME_URL || "http://localhost:5002", {
          auth: { ticket: data.ticket },
          transports: ["websocket", "polling"],
        });
        socket.on("connect", () => {
          if (!active) return;
          setQueueConnection("connected");
          setQueueError("");
        });
        socket.on("disconnect", () => {
          if (!active) return;
          setQueueConnection("disconnected");
          setQueueError("Connection to the live call queue was lost. Reconnecting...");
        });
        socket.on("connect_error", error => {
          if (!active) return;
          setQueueConnection("error");
          setQueueError(error.message === "UNAUTHORIZED"
            ? "The call queue rejected its secure ticket. Confirm CHATBOT_REALTIME_SECRET matches in the web app and realtime service, then restart both."
            : "Could not connect to the live call queue. Check that the realtime service is running.");
          console.error("Agent realtime connection failed:", error.message);
        });
        socket.on("video:incoming", (incoming: IncomingVideoCall) => {
          if (!active) return;
          setCallAcceptError("");
          setIncomingVideoCall(incoming);
        });
      } catch (error) {
        if (active) {
          setQueueConnection("error");
          setQueueError(error instanceof Error ? error.message : "Could not connect to the live call queue.");
        }
      }
    })();

    return () => {
      active = false;
      socket?.disconnect();
    };
  }, [agent]);

  useEffect(() => {
    if (!transcriptRoomId) return;
    let active = true;
    void fetch(`/api/agent/video-rooms/${encodeURIComponent(transcriptRoomId)}/messages`, {
      cache: "no-store",
    })
      .then(async response => {
        const data = await response.json() as { messages?: VideoCallMessage[] };
        if (!response.ok || !data.messages) throw new Error("Could not load the video-call transcript.");
        if (active) setCallTranscript(data.messages);
      })
      .catch(error => {
        if (active) setTranscriptError(error instanceof Error ? error.message : "Could not load the transcript.");
      })
      .finally(() => {
        if (active) setTranscriptLoading(false);
      });
    return () => { active = false; };
  }, [transcriptRoomId]);

  const acceptCall = async () => {
    if (!incomingVideoCall?.roomId || acceptingCall) return;
    setAcceptingCall(true);
    setCallAcceptError("");
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      permissionStream.getTracks().forEach(track => track.stop());
      const response = await fetch(`/api/agent/video-rooms/${encodeURIComponent(incomingVideoCall.roomId)}/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json() as { ticket?: string; participantId?: string };
      if (!response.ok || !data.ticket || !data.participantId) throw new Error("Could not join this video call.");
      setCallTicket(data.ticket);
      setCallParticipantId(data.participantId);
      setCallRoomId(incomingVideoCall.roomId);
      setInVideoCall(true);
      setIncomingVideoCall(null);
    } catch (error) {
      setCallAcceptError(error instanceof Error && error.name === "NotAllowedError"
        ? "Camera and microphone permission are required to accept the call."
        : error instanceof Error ? error.message : "Could not accept the call.");
    } finally {
      setAcceptingCall(false);
    }
  };

  const endVideoCall = () => {
    if (callRoomId) {
      setTranscriptRoomId(callRoomId);
      setTranscriptLoading(true);
      setTranscriptError("");
      setCallTranscript([]);
    }
    setInVideoCall(false);
    setIncomingVideoCall(null);
    setCallTicket("");
    setCallParticipantId("");
    setCallRoomId("");
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5ef] text-[#173c36]">
        <div className="flex items-center gap-3 text-sm font-medium">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#a5c947]" />
          Preparing your support desk...
        </div>
      </main>
    );
  }

  if (!agent) {
    return (
      <main className="min-h-screen bg-[#f3f5ef] p-4 text-[#153b35] sm:p-8">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_90px_-40px_rgba(16,59,53,0.35)] lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative flex min-h-64 flex-col justify-between overflow-hidden bg-[#103b35] p-8 text-white sm:p-12">
            <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />
            <div className="absolute -right-4 -top-8 h-44 w-44 rounded-full border border-[#c9e36a]/25" />
            <div className="relative flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#c9e36a] text-xl text-[#103b35]">
                <FaHeadset />
              </span>
              <span>
                <span className="block text-sm font-extrabold tracking-[0.18em]">URBAN CRUISE</span>
                <span className="mt-0.5 block text-[10px] font-semibold tracking-[0.2em] text-white/55">AGENT WORKSPACE</span>
              </span>
            </div>
            <div className="relative mt-12 max-w-md">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c9e36a]">A better journey starts here</p>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">
                Make every conversation feel effortless.
              </h1>
              <p className="mt-5 max-w-sm text-sm leading-6 text-white/70">
                Welcome to your calm, connected space for helping travellers plan what comes next.
              </p>
            </div>
            <div className="relative mt-12 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80">Live video support</span>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80">Private by design</span>
            </div>
          </section>

          <section className="flex items-center justify-center px-6 py-10 sm:px-12">
            <form onSubmit={signIn} className="w-full max-w-sm space-y-6">
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef4df] text-xl text-[#426642]">
                  <FaLock />
                </span>
                <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-[#64806d]">Secure access</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#153b35]">Sign in to your desk</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Use your agent credentials to receive video-call requests.</p>
              </div>
              {authError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{authError}</p>}
              <label className="block text-sm font-semibold text-slate-700">
                Username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-[#fbfcfa] px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#739447] focus:ring-4 focus:ring-[#739447]/10"
                  placeholder="Your agent username"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  minLength={12}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-[#fbfcfa] px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#739447] focus:ring-4 focus:ring-[#739447]/10"
                  placeholder="Enter your password"
                />
              </label>
              <button type="submit" disabled={signingIn} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#103b35] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#185349] disabled:cursor-wait disabled:opacity-60">
                {signingIn ? "Signing in..." : "Enter agent workspace"}
                {!signingIn && <FaArrowRight aria-hidden="true" />}
              </button>
              <p className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <FaShieldAlt aria-hidden="true" />
                Your support workspace is protected
              </p>
            </form>
          </section>
        </div>
      </main>
    );
  }

  const queueStatus = {
    connecting: {
      label: "Connecting",
      dot: "bg-amber-400",
      pill: "bg-amber-50 text-amber-800",
    },
    connected: {
      label: "Queue is live",
      dot: "bg-emerald-500",
      pill: "bg-emerald-50 text-emerald-800",
    },
    disconnected: {
      label: "Connection lost",
      dot: "bg-orange-500",
      pill: "bg-orange-50 text-orange-800",
    },
    error: {
      label: "Needs attention",
      dot: "bg-rose-500",
      pill: "bg-rose-50 text-rose-800",
    },
  }[queueConnection];

  return (
    <main className="min-h-screen bg-[#f3f5ef] text-[#183d36]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#103b35] px-5 py-6 text-white lg:flex">
        <div className="flex items-center gap-3 px-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#c9e36a] text-xl text-[#103b35]">
            <FaHeadset />
          </span>
          <span>
            <span className="block text-sm font-extrabold tracking-[0.16em]">URBAN CRUISE</span>
            <span className="mt-0.5 block text-[10px] font-semibold tracking-[0.2em] text-white/50">AGENT WORKSPACE</span>
          </span>
        </div>

        <div className="mt-12 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Workspace</div>
        <nav aria-label="Agent workspace" className="mt-3 space-y-1">
          <div aria-current="page" className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-3 text-sm font-semibold text-white">
            <FaComments className="text-[#c9e36a]" />
            Agent inbox
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#c9e36a]" />
          </div>
          <div className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/65">
            <FaVideo className="text-white/45" />
            Video support
          </div>
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
            <FaCircle className={`text-[7px] ${queueStatus.dot}`} />
            Call desk
          </div>
          <p className="mt-3 text-sm font-semibold">{queueStatus.label}</p>
          <p className="mt-1 text-xs leading-5 text-white/55">
            {queueConnection === "connected"
              ? "You’re ready to welcome the next traveller."
              : queueError || "Connecting to the secure request queue."}
          </p>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t border-white/10 px-2 pt-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dfe9c7] text-sm font-bold text-[#264c3e]">
            {agent.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{agent.displayName}</span>
            <span className="mt-0.5 block text-xs text-white/50">Travel support</span>
          </span>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between border-b border-[#e5e9df] bg-[#fbfcf9]/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#103b35] text-lg text-[#c9e36a]"><FaHeadset /></span>
            <span className="text-xs font-extrabold tracking-[0.14em]">URBAN CRUISE</span>
          </div>
          <div className="hidden text-sm text-slate-500 lg:block">
            Support workspace <span className="mx-2 text-slate-300">/</span><span className="font-semibold text-[#183d36]">Agent inbox</span>
          </div>
          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${queueStatus.pill}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${queueStatus.dot}`} />
              <span className="hidden sm:inline">{queueStatus.label}</span>
              <span className="sm:hidden">{queueConnection === "connected" ? "Online" : "Offline"}</span>
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dfe9c7] text-sm font-bold text-[#264c3e]">
              {agent.displayName.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>

        <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
          <section className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#758a5b]">Your support desk</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#183d36] sm:text-[2.6rem]">
                Good to have you here, {agent.displayName.split(" ")[0]}.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Make the next traveller’s plan feel a little easier.
              </p>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-[#e0e6d8] bg-white px-4 py-2.5 text-xs font-medium text-slate-600 sm:flex">
              <FaShieldAlt className="text-[#64806d]" />
              Private agent workspace
            </div>
          </section>

          {queueError && (
            <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-900">
              <FaCircle className="mt-1 shrink-0 text-[8px] text-rose-500" />
              <p className="leading-6">{queueError}</p>
            </div>
          )}

          <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#103b35] p-6 text-white shadow-[0_24px_70px_-42px_rgba(16,59,53,0.8)] sm:p-8 lg:p-10">
            <div className="absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full border border-white/10" />
            <div className="absolute right-8 top-8 -z-10 h-44 w-44 rounded-full border border-[#c9e36a]/20" />
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
              <div className="max-w-2xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#c9e36a]">A human touch, one journey at a time</p>
                <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                  Every great trip starts with feeling understood.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-white/65">
                  Your live desk brings travellers and the right travel expert together—one clear conversation at a time.
                </p>
                <div className="mt-7 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-xs text-white/80">Live video calls</span>
                  <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-xs text-white/80">Guest invites</span>
                  <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-xs text-white/80">Saved chat transcripts</span>
                </div>
              </div>
              <div className="relative mx-auto flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56">
                <span className="absolute inset-0 rounded-full border border-white/10" />
                <span className="absolute inset-5 rounded-full border border-[#c9e36a]/20" />
                <span className="absolute inset-10 rounded-full bg-[#c9e36a]/10" />
                <span className="relative flex h-20 w-20 items-center justify-center rounded-[1.7rem] bg-[#c9e36a] text-3xl text-[#103b35] shadow-[0_16px_50px_-15px_rgba(201,227,106,0.7)]">
                  <FaHeadset />
                </span>
                <span className="absolute bottom-1 rounded-full border border-white/10 bg-[#17483f] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/80">
                  Here when it matters
                </span>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
            <article className="rounded-[1.6rem] border border-[#e3e8de] bg-white p-5 shadow-[0_14px_38px_-32px_rgba(23,54,46,0.35)] sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#829176]">The live desk</p>
                  <h2 className="mt-2 text-xl font-semibold text-[#183d36]">Incoming conversations</h2>
                  <p className="mt-1 text-sm text-slate-500">Video requests will appear as soon as a traveller calls.</p>
                </div>
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${queueStatus.pill}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${queueStatus.dot}`} />
                  {queueStatus.label}
                </span>
              </div>
              <div className="mt-6 flex min-h-[235px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#dce4d6] bg-[#f8faf6] px-5 py-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eaf1dd] text-2xl text-[#52704e]">
                  <FaHeadset />
                </span>
                <h3 className="mt-4 text-base font-semibold text-[#29483e]">
                  {queueConnection === "connected" ? "Your queue is clear" : "Your call desk is getting ready"}
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  {queueConnection === "connected"
                    ? "You’re all caught up. New video requests will arrive here automatically."
                    : queueError || "Connecting to the secure call queue. Incoming requests will show as soon as you’re online."}
                </p>
                <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#64806d]">
                  <FaCircle className={`text-[7px] ${queueStatus.dot}`} />
                  {queueStatus.label}
                </div>
              </div>
            </article>

            <article className="rounded-[1.6rem] border border-[#e3e8de] bg-white p-5 shadow-[0_14px_38px_-32px_rgba(23,54,46,0.35)] sm:p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f0f3e8] text-lg text-[#55724d]">
                  <FaVideo />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#829176]">Thoughtful by design</p>
                  <h2 className="mt-1 text-lg font-semibold text-[#183d36]">Your call toolkit</h2>
                </div>
              </div>
              <div className="mt-6 space-y-5">
                <div className="flex gap-3">
                  <FaCheckCircle className="mt-0.5 shrink-0 text-sm text-[#7d9a51]" />
                  <div>
                    <p className="text-sm font-semibold text-[#29483e]">Bring everyone into the conversation</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Invite guests or teammates; calls support up to five people.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <FaShieldAlt className="mt-0.5 shrink-0 text-sm text-[#7d9a51]" />
                  <div>
                    <p className="text-sm font-semibold text-[#29483e]">Recording always needs consent</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Everyone must agree. Recordings download locally and aren’t uploaded.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <FaRegClock className="mt-0.5 shrink-0 text-sm text-[#7d9a51]" />
                  <div>
                    <p className="text-sm font-semibold text-[#29483e]">Keep the conversation close</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">In-call chat transcripts are available in the agent inbox for 90 days.</p>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className="mt-6 rounded-[1.6rem] border border-[#e3e8de] bg-[#eef2e8] p-5 sm:p-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#829176]">A simple rhythm</p>
                <h2 className="mt-1 text-lg font-semibold text-[#183d36]">From first hello to next steps</h2>
              </div>
              <p className="text-xs text-slate-500">A calm flow for you and every traveller.</p>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                { number: "01", title: "Welcome the caller", text: "Accept an incoming request when you’re ready." },
                { number: "02", title: "Plan together", text: "Talk, share context, and invite the right people." },
                { number: "03", title: "Leave a clear trail", text: "Review the saved chat transcript after the call." },
              ].map(step => (
                <div key={step.number} className="flex gap-4 rounded-2xl border border-[#dfe6d7] bg-white/70 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#103b35] text-[10px] font-bold tracking-wide text-[#c9e36a]">
                    {step.number}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[#29483e]">{step.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <footer className="flex flex-col gap-2 py-7 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>Urban Cruise · Agent support desk</span>
            <span className="flex items-center gap-2"><FaShieldAlt /> Private workspace for your team</span>
          </footer>
        </div>
      </div>

      {/* INCOMING CALL POPUP */}
      {incomingVideoCall && !inVideoCall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#09231f]/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/60 bg-[#fbfcf9] p-6 text-[#183d36] shadow-2xl sm:p-8">
            <div className="flex items-start justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eaf1dd] text-xl text-[#52704e]">
                <FaVideo className={incomingVideoCall.scheduledAt ? "" : "animate-pulse"} />
              </span>
              <span className="rounded-full bg-[#edf4df] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#52704e]">
                {incomingVideoCall.scheduledAt ? "Scheduled request" : "Live request"}
              </span>
            </div>
            <h2 className="mt-6 text-2xl font-semibold tracking-tight">
              {incomingVideoCall.scheduledAt ? "A traveller has a plan" : "A traveller is calling"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {incomingVideoCall.scheduledAt
                ? `${incomingVideoCall.name} requested a video call.`
                : `${incomingVideoCall.name} is ready to speak with a travel expert.`}
            </p>
            {incomingVideoCall.scheduledAt && (
              <p className="mt-4 rounded-xl bg-[#f0f3e8] px-4 py-3 text-sm font-semibold text-[#29483e]">
                {new Date(incomingVideoCall.scheduledAt).toLocaleString()}
              </p>
            )}
            <p className="mt-3 text-sm text-slate-500">{incomingVideoCall.phone}</p>
            {callAcceptError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{callAcceptError}</p>}
            <div className="mt-7 flex justify-end gap-3">
              <button onClick={() => { setIncomingVideoCall(null); setCallAcceptError(""); }} className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100">
                {incomingVideoCall.scheduledAt ? "Close" : "Decline"}
              </button>
              {!incomingVideoCall.scheduledAt && incomingVideoCall.roomId && (
                <button onClick={acceptCall} disabled={acceptingCall} className="flex items-center gap-2 rounded-xl bg-[#103b35] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#185349] disabled:cursor-wait disabled:opacity-60">
                  {acceptingCall ? "Connecting..." : "Accept"}
                  {!acceptingCall && <FaArrowRight aria-hidden="true" />}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE VIDEO CALL SCREEN */}
      {inVideoCall && callTicket && callParticipantId && callRoomId && (
        <div className="fixed inset-0 z-[100] bg-slate-950 p-2 sm:p-5">
          <VideoCallStage
            ticket={callTicket}
            participantId={callParticipantId}
            roomId={callRoomId}
            role="agent"
            onEnd={endVideoCall}
          />
        </div>
      )}

      {transcriptRoomId && (
        <div role="dialog" aria-modal="true" aria-labelledby="call-transcript-title" className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
          <section className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="call-transcript-title" className="font-bold">Video-call chat transcript</h2>
                <p className="mt-1 text-xs text-slate-500">Saved in the agent inbox for 90 days.</p>
              </div>
              <button type="button" onClick={() => setTranscriptRoomId("")} aria-label="Close transcript" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600"><FaTimes /></button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {transcriptLoading && <p className="text-sm text-slate-500">Loading transcript...</p>}
              {transcriptError && <p role="alert" className="text-sm text-red-700">{transcriptError}</p>}
              {!transcriptLoading && !transcriptError && callTranscript.length === 0 && (
                <p className="text-sm text-slate-500">No chat messages were sent during this call.</p>
              )}
              {callTranscript.map(message => (
                <article key={message.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-emerald-800">{message.author === "agent" ? "Urban Cruise agent" : "Customer / guest"}</span>
                    <time className="text-[10px] text-slate-400">{new Date(message.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{message.text}</p>
                </article>
              ))}
            </div>
            <footer className="border-t border-slate-200 p-4">
              <button type="button" onClick={() => setTranscriptRoomId("")} className="w-full rounded-xl bg-[#103B35] py-2.5 text-sm font-bold text-white">Close</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}