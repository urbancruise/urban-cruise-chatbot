"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import {
  FaComments,
  FaExpand,
  FaMicrophone,
  FaMicrophoneSlash,
  FaRegCircle,
  FaTimes,
  FaUserPlus,
  FaVideo,
  FaVideoSlash,
} from "react-icons/fa";

export interface VideoCallMessage {
  id: string;
  author: "user" | "agent";
  text: string;
  createdAt: string;
}

interface Participant {
  participantId: string;
  role: "customer" | "agent" | "guest";
  displayName: string;
}

interface RemoteMedia extends Participant {
  stream: MediaStream;
}

interface RecordingPrompt {
  requestId: string;
  requesterName: string;
}

interface UseVideoCallRoomOptions {
  ticket: string;
  participantId: string;
}

function useVideoCallRoom({ ticket, participantId }: UseVideoCallRoomOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMedia[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<VideoCallMessage[]>([]);
  const [callError, setCallError] = useState("");
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [recordingPrompt, setRecordingPrompt] = useState<RecordingPrompt | null>(null);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingRequester, setRecordingRequester] = useState(false);
  const [recordingDenied, setRecordingDenied] = useState(false);
  const [recordingDeniedReason, setRecordingDeniedReason] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const participantsRef = useRef(new Map<string, Participant>());

  const toggleMicrophone = useCallback(() => {
    const nextEnabled = !microphoneEnabled;
    streamRef.current?.getAudioTracks().forEach(track => { track.enabled = nextEnabled; });
    setMicrophoneEnabled(nextEnabled);
  }, [microphoneEnabled]);

  const toggleCamera = useCallback(() => {
    const nextEnabled = !cameraEnabled;
    streamRef.current?.getVideoTracks().forEach(track => { track.enabled = nextEnabled; });
    setCameraEnabled(nextEnabled);
  }, [cameraEnabled]);

  const requestRecording = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected || participants.length === 0) return;
    const requestId = crypto.randomUUID();
    setRecordingRequester(true);
    setRecordingDenied(false);
    setRecordingDeniedReason("");
    socket.emit("call:recording-request", { requestId });
  }, [participants.length]);

  const respondToRecording = useCallback((requestId: string, accepted: boolean) => {
    socketRef.current?.emit("call:recording-consent", { requestId, accepted });
    setRecordingPrompt(null);
  }, []);

  const stopRecording = useCallback(() => {
    socketRef.current?.emit("call:recording-stop");
  }, []);

  const endRoom = useCallback(() => {
    socketRef.current?.emit("call:end");
  }, []);

  const addMessage = useCallback((message: VideoCallMessage) => {
    setMessages(previous => previous.some(item => item.id === message.id) ? previous : [...previous, message]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let localStreamValue: MediaStream | null = null;
    const peerConnections = peerConnectionsRef.current;
    const pendingCandidates = pendingCandidatesRef.current;
    const participantsById = participantsRef.current;

    const closePeer = (peerId: string) => {
      peerConnections.get(peerId)?.close();
      peerConnections.delete(peerId);
      pendingCandidates.delete(peerId);
      setRemoteMedia(previous => previous.filter(item => item.participantId !== peerId));
    };

    const ensurePeer = (participant: Participant) => {
      const current = peerConnections.get(participant.participantId);
      if (current) return current;
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnections.set(participant.participantId, pc);
      const currentStream = localStreamValue;
      currentStream?.getTracks().forEach(track => pc.addTrack(track, currentStream));
      pc.onicecandidate = event => {
        if (event.candidate) {
          socketRef.current?.emit("rtc:ice", {
            targetId: participant.participantId,
            candidate: event.candidate.toJSON(),
          });
        }
      };
      pc.ontrack = event => {
        const stream = event.streams[0];
        if (!stream) return;
        setRemoteMedia(previous => {
          const existing = previous.find(item => item.participantId === participant.participantId);
          const nextParticipant = { ...participant, stream };
          return existing
            ? previous.map(item => item.participantId === participant.participantId ? nextParticipant : item)
            : [...previous, nextParticipant];
        });
      };
      return pc;
    };

    const flushCandidates = async (peerId: string, pc: RTCPeerConnection) => {
      const pending = pendingCandidates.get(peerId) ?? [];
      pendingCandidates.delete(peerId);
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const initiateOffer = async (participant: Participant) => {
      if (participantId.localeCompare(participant.participantId) >= 0) return;
      const pc = ensurePeer(participant);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("rtc:offer", {
          targetId: participant.participantId,
          offer: pc.localDescription,
        });
      } catch (error) {
        console.error("Could not create a peer video-call offer.", error);
        setCallError("Could not connect to another participant. Please try again.");
      }
    };

    const addParticipant = (participant: Participant) => {
      if (!participant?.participantId || participant.participantId === participantId) return;
      setParticipants(previous => previous.some(item => item.participantId === participant.participantId)
        ? previous.map(item => item.participantId === participant.participantId ? participant : item)
        : [...previous, participant]);
      participantsById.set(participant.participantId, participant);
      void initiateOffer(participant);
    };

    const connect = async () => {
      try {
        localStreamValue = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          localStreamValue.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = localStreamValue;
        setLocalStream(localStreamValue);
        const socket = io(process.env.NEXT_PUBLIC_CHAT_REALTIME_URL || "http://localhost:5002", {
          auth: { ticket },
        });
        socketRef.current = socket;
        socket.on("connect", () => {
          setConnected(true);
          socket.emit("call:join");
        });
        socket.on("disconnect", () => setConnected(false));
        socket.on("connect_error", error => {
          console.error("Video-call realtime connection failed.", error.message);
          setCallError("Could not connect to the video-call service.");
        });
        socket.on("call:participants", (current: Participant[]) => current.forEach(addParticipant));
        socket.on("call:participant-joined", addParticipant);
        socket.on("call:participant-left", ({ participantId: leftId }: { participantId: string }) => {
          closePeer(leftId);
          participantsById.delete(leftId);
          setParticipants(previous => previous.filter(item => item.participantId !== leftId));
        });
        socket.on("call:error", ({ code }: { code: string }) => {
          setCallError(code === "CALL_FULL"
            ? "This call has reached its five-participant limit."
            : "Could not join this call.");
        });
        socket.on("call:ended", () => {
          setEnded(true);
          setConnected(false);
          setRecordingActive(false);
          peerConnections.forEach(connection => connection.close());
          peerConnections.clear();
          localStreamValue?.getTracks().forEach(track => track.stop());
        });
        socket.on("rtc:offer", async (data: { senderId: string; targetId: string; offer: RTCSessionDescriptionInit }) => {
          if (data.targetId !== participantId) return;
          const participant = participantsById.get(data.senderId) ?? {
            participantId: data.senderId,
            role: "guest" as const,
            displayName: "Call participant",
          };
          const pc = ensurePeer(participant);
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            await flushCandidates(data.senderId, pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("rtc:answer", {
              targetId: data.senderId,
              answer: pc.localDescription,
            });
          } catch (error) {
            console.error("Could not answer a peer video-call offer.", error);
            setCallError("Could not connect to another participant. Please try again.");
          }
        });
        socket.on("rtc:answer", async (data: { senderId: string; targetId: string; answer: RTCSessionDescriptionInit }) => {
          if (data.targetId !== participantId) return;
          const pc = peerConnections.get(data.senderId);
          if (!pc) return;
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            await flushCandidates(data.senderId, pc);
          } catch (error) {
            console.error("Could not apply a peer video-call answer.", error);
            setCallError("Could not connect to another participant. Please try again.");
          }
        });
        socket.on("rtc:ice", async (data: { senderId: string; targetId: string; candidate: RTCIceCandidateInit }) => {
          if (data.targetId !== participantId) return;
          const pc = peerConnections.get(data.senderId);
          if (!pc || !pc.remoteDescription) {
            pendingCandidates.set(data.senderId, [...(pendingCandidates.get(data.senderId) ?? []), data.candidate]);
            return;
          }
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (error) {
            console.error("Could not apply a peer video-call network candidate.", error);
          }
        });
        socket.on("call:chat", addMessage);
        socket.on("call:recording-request", (prompt: RecordingPrompt) => setRecordingPrompt(prompt));
        socket.on("call:recording-approved", () => {
          setRecordingPrompt(null);
          setRecordingActive(true);
          setRecordingDenied(false);
          setRecordingDeniedReason("");
        });
        socket.on("call:recording-denied", () => {
          setRecordingPrompt(null);
          setRecordingRequester(false);
          setRecordingActive(false);
          setRecordingDenied(true);
          setRecordingDeniedReason("Recording was declined. No recording was made.");
        });
        socket.on("call:recording-blocked", ({ reason }: { reason: string }) => {
          setRecordingPrompt(null);
          setRecordingRequester(false);
          setRecordingActive(false);
          setRecordingDenied(true);
          setRecordingDeniedReason(reason);
        });
        socket.on("call:recording-stopped", () => {
          setRecordingPrompt(null);
          setRecordingActive(false);
          setRecordingRequester(false);
          setRecordingDenied(false);
          setRecordingDeniedReason("");
        });
      } catch (error) {
        console.error("Could not access video-call media.", error);
        setCallError("Allow camera and microphone access to join the video call.");
      }
    };

    void connect();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      peerConnections.forEach(connection => connection.close());
      peerConnections.clear();
      localStreamValue?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      pendingCandidates.clear();
      participantsById.clear();
    };
  }, [ticket, participantId, addMessage]);

  return {
    localStream,
    remoteMedia,
    participants,
    messages,
    callError,
    connected,
    ended,
    microphoneEnabled,
    cameraEnabled,
    recordingPrompt,
    recordingActive,
    recordingRequester,
    recordingDenied,
    recordingDeniedReason,
    socketRef,
    toggleMicrophone,
    toggleCamera,
    requestRecording,
    respondToRecording,
    stopRecording,
    endRoom,
    setCallError,
  };
}

interface VideoCallStageProps {
  ticket: string;
  participantId: string;
  roomId: string;
  role: "customer" | "agent" | "guest";
  onEnd: () => void;
}

export default function VideoCallStage({
  ticket,
  participantId,
  roomId,
  role,
  onEnd,
}: VideoCallStageProps) {
  const room = useVideoCallRoom({ ticket, participantId });
  const { stopRecording } = room;
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRecordingRequested, setIsRecordingRequested] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef(new Map<string, HTMLVideoElement>());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  useEffect(() => {
    if (localVideoRef.current && room.localStream) {
      localVideoRef.current.srcObject = room.localStream;
    }
  }, [room.localStream]);

  useEffect(() => {
    for (const participant of room.remoteMedia) {
      const video = remoteVideoRefs.current.get(participant.participantId);
      if (video && video.srcObject !== participant.stream) video.srcObject = participant.stream;
    }
  }, [room.remoteMedia]);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const downloadRecording = useCallback((chunks: Blob[]) => {
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `urban-cruise-call-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, []);

  const stopLocalRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const startLocalRecorder = useCallback(() => {
    if (!room.localStream || recorderRef.current) return;
    let animationFrame = 0;
    let audioContext: AudioContext | null = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Recording canvas is unavailable.");
      const videoElements = () => [
        localVideoRef.current,
        ...room.remoteMedia.map(item => remoteVideoRefs.current.get(item.participantId) ?? null),
      ].filter((video): video is HTMLVideoElement => Boolean(video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA));
      const draw = () => {
        context.fillStyle = "#07110f";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const videos = videoElements();
        const columns = videos.length <= 2 ? videos.length : 2;
        const rows = Math.max(1, Math.ceil(videos.length / columns));
        const tileWidth = canvas.width / columns;
        const tileHeight = canvas.height / rows;
        videos.forEach((video, index) => {
          const x = (index % columns) * tileWidth;
          const y = Math.floor(index / columns) * tileHeight;
          context.drawImage(video, x, y, tileWidth, tileHeight);
        });
        animationFrame = requestAnimationFrame(draw);
      };
      draw();

      audioContext = new AudioContext();
      const audioDestination = audioContext.createMediaStreamDestination();
      const audioStreams = [room.localStream, ...room.remoteMedia.map(item => item.stream)];
      for (const stream of audioStreams) {
        if (stream.getAudioTracks().length) {
          audioContext.createMediaStreamSource(stream).connect(audioDestination);
        }
      }
      void audioContext.resume();

      const videoStream = canvas.captureStream(24);
      const recordingStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";
      const recorder = mimeType
        ? new MediaRecorder(recordingStream, { mimeType })
        : new MediaRecorder(recordingStream);
      recorderChunksRef.current = [];
      recorder.ondataavailable = event => {
        if (event.data.size) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        cancelAnimationFrame(animationFrame);
        audioContext?.close();
        videoStream.getTracks().forEach(track => track.stop());
        audioDestination.stream.getTracks().forEach(track => track.stop());
        if (isRecordingRequested) downloadRecording(recorderChunksRef.current);
        recorderChunksRef.current = [];
        recorderRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setRecordingError("");
    } catch (error) {
      console.error("Could not start the local call recording.", error);
      cancelAnimationFrame(animationFrame);
      audioContext?.close();
      recorderRef.current = null;
      stopRecording();
      setRecordingError("Your browser could not start recording. No recording was saved.");
    }
  }, [downloadRecording, isRecordingRequested, room.localStream, room.remoteMedia, stopRecording]);

  useEffect(() => {
    let frame = 0;
    if (room.recordingActive && room.recordingRequester) {
      frame = requestAnimationFrame(() => startLocalRecorder());
    }
    if (!room.recordingActive) stopLocalRecorder();
    return () => cancelAnimationFrame(frame);
  }, [room.recordingActive, room.recordingRequester, startLocalRecorder, stopLocalRecorder]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = chatText.trim();
    if (!text || sendingMessage) return;
    setSendingMessage(true);
    try {
      const endpoint = role === "agent" ? "/api/agent/video-messages" : "/api/chat/video-messages";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, text }),
      });
      if (!response.ok) throw new Error("Message could not be sent to the call.");
      setChatText("");
    } catch (error) {
      console.error("Could not send an in-call chat message.", error);
      room.setCallError(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setSendingMessage(false);
    }
  };

  const createInvite = async () => {
    setInviteLoading(true);
    setInviteError("");
    try {
      const response = await fetch(`/api/chat/video-rooms/${encodeURIComponent(roomId)}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }),
      });
      const data = await response.json() as { inviteUrl?: string };
      if (!response.ok || !data.inviteUrl) throw new Error("Could not create a participant invite.");
      setInviteUrl(data.inviteUrl);
      await navigator.clipboard.writeText(data.inviteUrl).catch(() => undefined);
    } catch (error) {
      console.error("Could not create a video-call invite.", error);
      setInviteError(error instanceof Error ? error.message : "Could not create a participant invite.");
    } finally {
      setInviteLoading(false);
    }
  };

  const requestCallRecording = () => {
    setIsRecordingRequested(true);
    room.requestRecording();
  };

  const endCall = async () => {
    if (!room.ended) room.endRoom();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>(resolve => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        stopLocalRecorder();
      });
    }
    if (!room.ended) {
      try {
        const response = await fetch(`/api/chat/video-rooms/${encodeURIComponent(roomId)}/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket }),
        });
        if (!response.ok) console.error("The call ended locally, but the server could not close the room.");
      } catch (error) {
        console.error("The call ended locally, but the server could not close the room.", error);
      }
    }
    onEnd();
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch (error) {
      console.error("Could not change video-call fullscreen mode.", error);
      room.setCallError("Fullscreen is unavailable in this browser.");
    }
  };

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-[#07110f] text-white">
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className={`relative grid min-h-0 flex-1 gap-2 p-2 ${room.remoteMedia.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
            {room.remoteMedia.length === 0 && (
              <div className="absolute inset-2 flex items-center justify-center rounded-xl bg-slate-950 text-center">
                <div>
                  <FaVideo className="mx-auto mb-3 text-2xl text-emerald-300" />
                  <p className="font-semibold">{room.ended ? "Call ended" : "Waiting for participants"}</p>
                  <p className="mt-1 text-xs text-slate-400">{room.connected ? "Your camera and microphone are ready." : "Connecting to the video-call service..."}</p>
                </div>
              </div>
            )}
            {room.remoteMedia.map(participant => (
              <div key={participant.participantId} className="relative min-h-0 overflow-hidden rounded-xl bg-black">
                <video
                  ref={element => {
                    if (element) remoteVideoRefs.current.set(participant.participantId, element);
                    else remoteVideoRefs.current.delete(participant.participantId);
                  }}
                  autoPlay
                  playsInline
                  className="h-full w-full object-contain"
                />
                <span className="absolute bottom-3 left-3 rounded-lg bg-black/55 px-3 py-1.5 text-xs font-medium">
                  {participant.displayName}
                </span>
              </div>
            ))}
            <div className="absolute bottom-4 right-4 h-28 w-24 overflow-hidden rounded-xl border-2 border-white/80 bg-black shadow-xl sm:h-36 sm:w-28">
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px]">You</span>
            </div>
          </div>

          {(room.callError || recordingError || room.recordingDenied) && (
            <div role="status" className="mx-3 mb-2 rounded-lg bg-red-950/90 px-3 py-2 text-xs text-red-100">
              {room.callError || recordingError || room.recordingDeniedReason}
            </div>
          )}
          {room.recordingActive && (
            <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-red-700 px-3 py-1.5 text-xs font-semibold shadow-lg">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Recording
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-slate-950/90 px-2 py-3 sm:gap-3">
            <button type="button" onClick={room.toggleMicrophone} aria-label={room.microphoneEnabled ? "Mute microphone" : "Unmute microphone"} className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-lg transition hover:bg-slate-600">
              {room.microphoneEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
            </button>
            <button type="button" onClick={room.toggleCamera} aria-label={room.cameraEnabled ? "Turn camera off" : "Turn camera on"} className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-lg transition hover:bg-slate-600">
              {room.cameraEnabled ? <FaVideo /> : <FaVideoSlash />}
            </button>
            <button type="button" onClick={() => setChatOpen(value => !value)} aria-label="Toggle in-call chat" aria-pressed={chatOpen} className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-lg transition hover:bg-slate-600">
              <FaComments />
            </button>
            <button type="button" onClick={createInvite} disabled={inviteLoading || room.participants.length >= 4} aria-label="Invite a participant" className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-lg transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40">
              <FaUserPlus />
            </button>
            <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-lg transition hover:bg-slate-600">
              <FaExpand />
            </button>
            <button type="button" onClick={room.recordingActive ? room.stopRecording : requestCallRecording} disabled={room.participants.length === 0 || Boolean(room.recordingPrompt)} aria-label={room.recordingActive ? "Stop recording" : role === "agent" ? "Start call recording" : "Request call recording"} className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${room.recordingActive ? "bg-red-700 hover:bg-red-600" : "bg-slate-700 hover:bg-slate-600"}`}>
              <FaRegCircle />
            </button>
            <button type="button" onClick={endCall} aria-label="End video call" className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-lg transition hover:bg-red-500">
              <FaTimes />
            </button>
          </div>
        </div>

        {chatOpen && (
          <aside className="absolute inset-y-0 right-0 z-10 flex w-[min(340px,88%)] flex-col border-l border-slate-200 bg-white text-slate-900 shadow-2xl sm:static sm:w-80">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold">In-call chat</h2>
                <p className="text-[11px] text-slate-500">Messages are saved in the agent inbox for 90 days.</p>
              </div>
              <button type="button" onClick={() => setChatOpen(false)} aria-label="Close in-call chat" className="text-slate-500"><FaTimes /></button>
            </div>
            <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-3">
              {room.messages.map(message => (
                <div key={message.id} className={`rounded-xl px-3 py-2 text-sm ${message.author === (role === "agent" ? "agent" : "user") ? "ml-5 bg-emerald-50 text-emerald-950" : "mr-5 bg-slate-100 text-slate-800"}`}>
                  <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">{message.author === "agent" ? "Urban Cruise" : "Customer / guest"}</p>
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                </div>
              ))}
              {room.messages.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Start a conversation during your call.</p>}
            </div>
            <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-200 p-3">
              <input value={chatText} onChange={event => setChatText(event.target.value)} maxLength={1000} aria-label="Message" placeholder="Type a message..." className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700" />
              <button type="submit" disabled={!chatText.trim() || sendingMessage} className="rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white disabled:opacity-50">{sendingMessage ? "..." : "Send"}</button>
            </form>
          </aside>
        )}
      </div>

      {room.recordingPrompt && (
        <div role="dialog" aria-modal="true" aria-labelledby="recording-consent-title" className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-950 shadow-2xl">
            <h2 id="recording-consent-title" className="text-lg font-bold">Recording consent required</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {room.recordingPrompt.requesterName} requested to record this call. Recording will start only if everyone agrees, and the recording is saved to the requester&apos;s device—not uploaded to Urban Cruise.
            </p>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => room.respondToRecording(room.recordingPrompt!.requestId, false)} className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold">Decline</button>
              <button type="button" onClick={() => room.respondToRecording(room.recordingPrompt!.requestId, true)} className="flex-1 rounded-xl bg-emerald-800 py-2.5 text-sm font-semibold text-white">Allow recording</button>
            </div>
          </div>
        </div>
      )}

      {room.recordingRequester && !room.recordingActive && !room.recordingDenied && !room.recordingPrompt && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-slate-800 px-4 py-2 text-xs text-white shadow-lg">
          Waiting for everyone to consent to recording
        </div>
      )}

      {inviteUrl && (
        <div role="dialog" aria-modal="true" aria-labelledby="invite-title" className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-950 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 id="invite-title" className="text-lg font-bold">Invite a participant</h2>
              <button type="button" onClick={() => setInviteUrl("")} aria-label="Close invite" className="text-slate-500"><FaTimes /></button>
            </div>
            <p className="mt-2 text-sm text-slate-600">This one-time invite expires in 30 minutes. The call supports up to five participants.</p>
            <input readOnly value={inviteUrl} aria-label="Participant invite link" className="mt-4 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-600" />
            <button type="button" onClick={() => navigator.clipboard.writeText(inviteUrl).catch(() => setInviteError("Copy the invite link above."))} className="mt-3 w-full rounded-xl bg-emerald-800 py-2.5 text-sm font-bold text-white">Copy link</button>
          </div>
        </div>
      )}
      {inviteError && (
        <div role="alert" className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-red-900 px-4 py-2 text-xs text-white">
          {inviteError}
        </div>
      )}
    </div>
  );
}
