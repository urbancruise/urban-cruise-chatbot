"use client";

import { useState } from "react";
import {
  FaArrowRight,
  FaCalendarAlt,
  FaCheck,
  FaChevronLeft,
  FaChevronRight,
  FaClock,
  FaGlobe,
  FaRegClock,
  FaShieldAlt,
  FaTimes,
  FaVideo,
} from "react-icons/fa";
import VideoCallStage from "@/components/chat/VideoCallStage";

const CALL_START_HOUR = 11;
const CALL_END_HOUR = 19;
const SLOTS_PER_PAGE = 8;

interface VideoCallFormData {
  name: string;
  email: string;
  phone: string;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAvailableDates() {
  const dates: Date[] = [];
  const date = new Date();
  while (dates.length < 6) {
    if (date.getDay() !== 0) dates.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return dates;
}

function formatTime(hour: number, minute: number) {
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getTimeZoneLabel() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${timeZone} (UTC${sign}${hours}:${minutes})`;
}

export default function VideoCallWidget({
  onClose,
  sessionToken,
  initialStep = 1,
  initialFormData,
  scheduledAt,
}: {
  onClose: () => void;
  sessionToken: string;
  initialStep?: number;
  initialFormData?: VideoCallFormData;
  scheduledAt?: string;
}) {
  const [step, setStep] = useState(initialStep);
  const [formData, setFormData] = useState(initialFormData ?? { name: "", email: "", phone: "" });
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [timePage, setTimePage] = useState(0);
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [scheduleSubmitted, setScheduleSubmitted] = useState(false);
  const [agentNotificationSent, setAgentNotificationSent] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [startingCall, setStartingCall] = useState(false);
  const [callError, setCallError] = useState("");
  const [callRoomId, setCallRoomId] = useState("");
  const [callTicket, setCallTicket] = useState("");
  const [callParticipantId, setCallParticipantId] = useState("");
  const [allowAgentRecording, setAllowAgentRecording] = useState(false);

  const getCurrentSessionToken = async (): Promise<string> => {
    if (sessionToken) return sessionToken;

    const res = await fetch("/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ languageCode: "en" }),
    });
    if (!res.ok) throw new Error("Could not start your chat session.");
    const data = await res.json() as { sessionToken?: unknown };
    if (typeof data.sessionToken !== "string" || !data.sessionToken) {
      throw new Error("Could not start your chat session.");
    }
    localStorage.setItem("urban-cruise-chat-session", data.sessionToken);
    return data.sessionToken;
  };

  const startVideoCall = async () => {
    if (startingCall) return;
    setStartingCall(true);
    setCallError("");
    try {
      const currentToken = await getCurrentSessionToken();
      const mediaPermission = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaPermission.getTracks().forEach(track => track.stop());
      const requestResponse = await fetch("/api/chat/video-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: currentToken,
          name: formData.name,
          email: formData.email,
          phone: `+91${formData.phone}`,
          allowAgentRecording,
        })
      });
      const data = await requestResponse.json() as {
        roomId?: string;
        ticket?: string;
        participantId?: string;
      };
      if (!requestResponse.ok || !data.roomId || !data.ticket || !data.participantId) {
        throw new Error("Could not notify an agent. Please try again.");
      }

      setCallRoomId(data.roomId);
      setCallTicket(data.ticket);
      setCallParticipantId(data.participantId);
      setInCall(true);
      setStep(3);
    } catch (error) {
      console.error("Could not start the video call.", error);
      setCallError(error instanceof Error && error.name === "NotAllowedError"
        ? "Allow camera and microphone access to start the call."
        : error instanceof Error ? error.message : "Could not start the video call. Please try again.");
    } finally {
      setStartingCall(false);
    }
  };

  const availableDates = getAvailableDates();
  const selectedDateValue = selectedDate || localDateKey(availableDates[0]);
  const now = new Date();
  const availableTimes = Array.from({ length: (CALL_END_HOUR - CALL_START_HOUR) * 2 }, (_, index) => {
    const hour = CALL_START_HOUR + Math.floor(index / 2);
    const minute = (index % 2) * 30;
    return { hour, minute, value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
  }).filter(({ hour, minute }) => {
    const slot = new Date(`${selectedDateValue}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    return selectedDateValue !== localDateKey(now) || slot > now;
  });
  const visibleTimes = availableTimes.slice(timePage * SLOTS_PER_PAGE, (timePage + 1) * SLOTS_PER_PAGE);

  const submitSchedule = async () => {
    if (!selectedTime || submittingSchedule) return;
    setSubmittingSchedule(true);
    setCallError("");
    try {
      const currentToken = await getCurrentSessionToken();
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const callDate = new Date(`${selectedDateValue}T00:00:00`);
      callDate.setHours(hours, minutes, 0, 0);
      const response = await fetch("/api/chat/video-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: currentToken,
          name: formData.name,
          email: formData.email,
          phone: `+91${formData.phone}`,
          scheduledAt: callDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!response.ok) throw new Error("Could not send your scheduling request. Please try again.");
      const result = await response.json() as { agentNotificationSent?: boolean };
      setAgentNotificationSent(result.agentNotificationSent === true);
      setScheduleSubmitted(true);
      setStep(5);
    } catch (error) {
      console.error("Could not submit the video-call scheduling request.", error);
      setCallError(error instanceof Error ? error.message : "Could not send your scheduling request. Please try again.");
    } finally {
      setSubmittingSchedule(false);
    }
  };

  const formatDate = (date: Date) => ({
    weekday: localDateKey(date) === localDateKey(now)
      ? "Today"
      : date.toLocaleDateString([], { weekday: "short" }),
    day: date.toLocaleDateString([], { day: "2-digit" }),
    month: date.toLocaleDateString([], { month: "short" }),
  });

  const currentStage = step === 1 ? 1 : step === 2 ? 2 : 3;
  const stageDescription = currentStage === 1
    ? "Your details"
    : currentStage === 2
      ? "Choose how to connect"
      : "Set your call time";

  const endCall = () => {
    if (callRoomId && callTicket) {
      void fetch(`/api/chat/video-rooms/${encodeURIComponent(callRoomId)}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: callTicket }),
      }).catch(error => console.error("Could not end the video-call room.", error));
    }
    setInCall(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
      <div className="relative grid h-[650px] max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl grid-cols-1 overflow-hidden rounded-[28px] bg-white shadow-[0_32px_100px_-28px_rgba(4,31,27,0.65)] md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="relative hidden overflow-hidden bg-[#103B35] p-8 text-white md:flex md:flex-col">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F7B84B] text-[#103B35]">
              <FaVideo className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-wide">URBAN CRUISE</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-100/70">Video concierge</p>
            </div>
          </div>

          <svg aria-hidden="true" viewBox="0 0 240 220" className="absolute -right-10 top-28 h-56 w-60 text-emerald-200/20">
            <path d="M25 165c35-72 74 25 112-48s61-47 83-91" fill="none" stroke="currentColor" strokeDasharray="5 8" strokeLinecap="round" strokeWidth="2" />
            <circle cx="25" cy="165" r="7" fill="#F7B84B" />
            <circle cx="137" cy="117" r="5" fill="currentColor" />
            <circle cx="220" cy="26" r="7" fill="#F7B84B" />
          </svg>

          <div className="relative mt-auto">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F7B84B]" />
              A better trip starts here
            </span>
            <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight">
              Let&apos;s plan<br />something<br /><span className="text-[#F7B84B]">wonderful.</span>
            </h2>
            <p className="mt-4 max-w-[210px] text-sm leading-6 text-emerald-50/75">
              Meet a travel expert face to face and get help with your next journey.
            </p>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.07] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[#F7B84B]">
                  <FaClock />
                </div>
                <div>
                  <p className="text-xs font-semibold">Here when you need us</p>
                  <p className="mt-1 text-[11px] text-emerald-100/70">Mon–Sat · 11 AM–7 PM</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="relative flex min-w-0 flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-8">
            <div className="min-w-[130px]">
              <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-emerald-800 md:text-slate-500">Video chat</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{stageDescription}</p>
            </div>
            <div className="flex items-center gap-1.5" aria-label={`Step ${currentStage} of 3`}>
              {[1, 2, 3].map(stage => (
                <span
                  key={stage}
                  className={`h-1.5 rounded-full transition-all ${stage === currentStage ? "w-8 bg-[#103B35]" : stage < currentStage ? "w-4 bg-[#F7B84B]" : "w-4 bg-slate-200"}`}
                />
              ))}
            </div>
            <button onClick={endCall} aria-label="Close video chat" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200">
              <FaTimes />
            </button>
          </div>

          <div className="flex h-7 shrink-0 items-center justify-center gap-1.5 border-b border-slate-100 bg-slate-50 text-[9px] font-semibold tracking-[0.16em] text-slate-500" aria-label="Powered by Xora">
            <span>POWERED BY</span>
            <span className="font-extrabold text-slate-800">XORA</span>
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 text-emerald-500">
              <path d="M8 0.8 9.5 6.5 15.2 8l-5.7 1.5L8 15.2l-1.5-5.7L.8 8l5.7-1.5L8 .8Z" fill="currentColor" />
              <circle cx="13.5" cy="2.5" r="1.2" fill="currentColor" />
            </svg>
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-white p-4 sm:p-6">
          {step === 1 && (
            <form onSubmit={(e) => { e.preventDefault(); setStep(2); }} className="flex h-full flex-col">
              <div className="space-y-5">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#F7B84B]" />
                    Let&apos;s get acquainted
                  </span>
                  <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Who are we speaking with?</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-500">Share your details and our travel expert will be ready to help.</p>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Full name</span>
                    <input
                      type="text"
                      placeholder="e.g. Pankaj Chauhan"
                      autoComplete="name"
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-900/10"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Email address</span>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-900/10"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Mobile number</span>
                    <div className="mt-1.5 flex h-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition focus-within:border-emerald-700 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-900/10">
                      <span className="flex items-center border-r border-slate-200 bg-white px-4 text-sm font-medium text-slate-600">+91</span>
                  <input
                    type="tel"
                    placeholder="10-digit number"
                    autoComplete="tel-national"
                    inputMode="numeric"
                    pattern="[6-9][0-9]{9}"
                    maxLength={10}
                    required
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    aria-label="Phone number"
                        className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-slate-400"
                  />
                    </div>
                  </label>
                </div>
              </div>
              <div className="mt-auto pt-6">
                <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#103B35] px-5 text-sm font-bold text-white shadow-lg shadow-emerald-950/15 transition hover:bg-[#0B302B]">
                  Continue to call options <FaArrowRight className="text-xs" />
                </button>
                <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                  <FaShieldAlt className="text-emerald-700" /> Your details stay private with Urban Cruise
                </p>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="flex h-full min-h-0 flex-col overflow-y-auto">
              <div className="mb-7">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">Choose your pace</span>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">How would you like to connect?</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">Pick what works best. Either way, a real travel expert is here to help.</p>
              </div>
              {scheduledAt && (
                <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <FaCalendarAlt className="shrink-0 text-emerald-700" />
                  <span>Scheduled for <strong>{new Date(scheduledAt).toLocaleString()}</strong></span>
                </div>
              )}
              <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-left">
                <input
                  type="checkbox"
                  checked={allowAgentRecording}
                  onChange={event => setAllowAgentRecording(event.target.checked)}
                  aria-describedby="agent-recording-consent-help"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-800"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-800">I&apos;m okay with the agent recording this call</span>
                  <span id="agent-recording-consent-help" className="mt-1 block text-[11px] leading-4 text-slate-500">
                    If everyone else also opts in before joining, an agent can start recording without another prompt. A recording indicator stays visible, and the file is saved on the recorder&apos;s device. You can join without opting in.
                  </span>
                </span>
              </label>
              {callError && <p role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{callError}</p>}
              <div className={`grid gap-3 ${scheduledAt ? "" : "sm:grid-cols-2"}`}>
                <button onClick={startVideoCall} disabled={startingCall} className="group flex min-h-48 flex-col items-start rounded-2xl border border-emerald-900/15 bg-[#103B35] p-5 text-left text-white shadow-lg shadow-emerald-950/10 transition hover:-translate-y-0.5 hover:bg-[#0B302B] disabled:cursor-wait disabled:opacity-70">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F7B84B] text-[#103B35]"><FaVideo /></span>
                  <span className="mt-5 text-base font-semibold">{startingCall ? "Connecting..." : "Start a live call"}</span>
                  <span className="mt-1 text-xs leading-5 text-emerald-50/70">Talk to a sales expert right now.</span>
                  <span className="mt-auto flex items-center gap-2 pt-4 text-xs font-bold text-[#F7B84B]">Join video chat <FaArrowRight /></span>
                </button>
                {!scheduledAt && (
                  <button
                    onClick={() => { setCallError(""); setSelectedTime(""); setTimePage(0); setStep(4); }}
                    className="group flex min-h-48 flex-col items-start rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-900/30 hover:bg-white hover:shadow-lg"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F7B84B]/25 text-emerald-900"><FaRegClock /></span>
                    <span className="mt-5 text-base font-semibold text-slate-950">Schedule for later</span>
                    <span className="mt-1 text-xs leading-5 text-slate-500">Choose a date and time that suits you.</span>
                    <span className="mt-auto flex items-center gap-2 pt-4 text-xs font-bold text-emerald-800">Pick a time <FaArrowRight /></span>
                  </button>
                )}
              </div>
              {!scheduledAt && (
                <button type="button" onClick={() => setStep(1)} className="mt-auto self-start pt-6 text-xs font-semibold text-slate-500 transition hover:text-emerald-800">
                  <FaChevronLeft className="mr-1 inline" /> Back to your details
                </button>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="flex h-full flex-col overflow-y-auto px-0.5">
              <div className="relative mb-1 flex min-h-9 items-center justify-center">
                <button type="button" aria-label="Back to call options" onClick={() => setStep(2)} className="absolute left-0 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-800">
                  <FaChevronLeft />
                </button>
                <h2 className="text-center text-lg font-semibold tracking-tight text-slate-950">Schedule a video call</h2>
              </div>
              <p className="mb-4 text-center text-xs leading-5 text-slate-500">Choose a time to speak with one of our travel experts.<br />Monday–Saturday · 11 AM–7 PM</p>

              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">Select a date</h3>
              <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {availableDates.map(date => {
                  const dateKey = localDateKey(date);
                  const labels = formatDate(date);
                  const isSelected = selectedDateValue === dateKey;
                  return (
                    <button
                      type="button"
                      key={dateKey}
                      onClick={() => { setSelectedDate(dateKey); setSelectedTime(""); setTimePage(0); }}
                      aria-pressed={isSelected}
                      className={`rounded-xl border px-1 py-2 text-center text-xs transition ${isSelected ? "border-emerald-800 bg-emerald-50 text-emerald-950 shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-800/40 hover:bg-emerald-50/50"}`}
                    >
                      <span className="block text-[10px] font-medium uppercase tracking-wide opacity-70">{labels.weekday}</span>
                      <span className="mt-1 block text-sm font-bold">{labels.day} <span className="text-[10px] font-medium">{labels.month}</span></span>
                    </button>
                  );
                })}
              </div>

              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Select a time slot</h3>
                <div className="flex gap-2">
                  <button type="button" aria-label="Previous time slots" disabled={timePage === 0} onClick={() => setTimePage(page => page - 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-emerald-50 disabled:opacity-30">
                    <FaChevronLeft />
                  </button>
                  <button type="button" aria-label="Next time slots" disabled={(timePage + 1) * SLOTS_PER_PAGE >= availableTimes.length} onClick={() => setTimePage(page => page + 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-emerald-50 disabled:opacity-30">
                    <FaChevronRight />
                  </button>
                </div>
              </div>
              <div className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-slate-50 py-2 text-[11px] text-slate-500">
                <FaGlobe className="text-emerald-800" /> Times shown in {getTimeZoneLabel()}
              </div>
              {visibleTimes.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {visibleTimes.map(({ value, hour, minute }) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setSelectedTime(value)}
                      aria-pressed={selectedTime === value}
                      className={`min-h-9 rounded-lg border px-2 py-2 text-xs font-medium transition ${selectedTime === value ? "border-emerald-800 bg-emerald-800 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-800/40 hover:bg-emerald-50"}`}
                    >
                      {formatTime(hour, minute)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="py-3 text-center text-sm text-slate-500">No more slots are available for this date.</p>
              )}
              {callError && <p role="alert" className="mt-2 text-center text-sm text-red-600">{callError}</p>}
              <button
                type="button"
                onClick={submitSchedule}
                disabled={!selectedTime || submittingSchedule}
                className="mt-auto min-h-11 w-full rounded-xl bg-[#103B35] py-2 text-sm font-bold text-white shadow-lg shadow-emerald-950/10 transition hover:bg-[#0B302B] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {submittingSchedule ? "Sending request..." : "Confirm time"}
              </button>
            </div>
          )}

          {step === 5 && scheduleSubmitted && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-800 shadow-inner">
                <FaCheck />
              </div>
              <span className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">You&apos;re on the calendar</span>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Request received</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Your call is requested for <strong>{new Date(`${selectedDateValue}T00:00:00`).toLocaleDateString()} at {formatTime(Number(selectedTime.split(":")[0]), Number(selectedTime.split(":")[1]))}</strong>. We emailed the joining link to <strong>{formData.email}</strong>.
                {agentNotificationSent
                  ? " Our sales team will contact you to confirm availability."
                  : " The sales team could not be notified right now. Please contact them to confirm availability."}
              </p>
              <button onClick={endCall} className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#103B35] text-sm font-bold text-white transition hover:bg-[#0B302B]">
                Done <FaCheck className="text-xs" />
              </button>
            </div>
          )}

          {step === 3 && inCall && callTicket && callParticipantId && callRoomId && (
            <VideoCallStage
              ticket={callTicket}
              participantId={callParticipantId}
              roomId={callRoomId}
              role="customer"
              onEnd={() => {
                setInCall(false);
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  </div>
  );
}