"use client";

import { useState, type FormEvent } from "react";
import VideoCallStage from "@/components/chat/VideoCallStage";

interface InviteCall {
  roomId: string;
  ticket: string;
  participantId: string;
  role: "agent" | "guest";
}

export default function VideoCallInvite({ inviteToken }: { inviteToken: string }) {
  const [name, setName] = useState("");
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [call, setCall] = useState<InviteCall | null>(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  const joinCall = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setJoining(true);
    setError("");
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      permissionStream.getTracks().forEach(track => track.stop());
      const response = await fetch("/api/chat/video-invites/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken, displayName: name, recordingConsent }),
      });
      const data = await response.json() as InviteCall & { error?: { code?: string } };
      if (!response.ok || !data.ticket || !data.participantId || !data.roomId) {
        throw new Error(data.error?.code === "VIDEO_CALL_INVITE_INVALID"
          ? "This invite has expired or has already been used."
          : "Could not join this video call.");
      }
      setCall(data);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join this video call.");
    } finally {
      setJoining(false);
    }
  };

  if (call) {
    return (
      <main className="fixed inset-0 bg-slate-950 p-2 sm:p-5">
        <VideoCallStage
          ticket={call.ticket}
          participantId={call.participantId}
          roomId={call.roomId}
          role={call.role}
          onEnd={() => setCall(null)}
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#103B35] px-4 py-10">
      <form onSubmit={joinCall} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800">Urban Cruise · Video concierge</span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Join the video call</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Enter your name to join. Recording starts only if everyone on the call gives permission.</p>
        <label className="mt-6 block">
          <span className="text-xs font-semibold text-slate-700">Your name</span>
          <input required minLength={1} maxLength={120} value={name} onChange={event => setName(event.target.value)} autoComplete="name" className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-900/10" />
        </label>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <input
            type="checkbox"
            checked={recordingConsent}
            onChange={event => setRecordingConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-800"
          />
          <span>
            <span className="block text-xs font-semibold text-slate-800">I&apos;m okay with the agent recording this call</span>
            <span className="mt-1 block text-[11px] leading-4 text-slate-500">
              If everyone else also opts in before joining, an agent can start recording without another prompt. A recording indicator stays visible, and the file is saved on the recorder&apos;s device. You can join without opting in.
            </span>
          </span>
        </label>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={joining} className="mt-6 h-12 w-full rounded-xl bg-[#103B35] text-sm font-bold text-white disabled:opacity-60">
          {joining ? "Joining..." : "Join video call"}
        </button>
      </form>
    </main>
  );
}
