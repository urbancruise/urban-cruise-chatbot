"use client";

import { useState, useRef } from "react";
import { FaTimes, FaVideo } from "react-icons/fa";
import { io, Socket } from "socket.io-client";

export default function VideoCallWidget({ onClose, sessionToken }: { onClose: () => void, sessionToken: string }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "" });
  const [inCall, setInCall] = useState(false);
  const [startingCall, setStartingCall] = useState(false);
  const [callError, setCallError] = useState("");
  const [remoteConnected, setRemoteConnected] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const startVideoCall = async () => {
    if (startingCall) return;
    setStartingCall(true);
    setCallError("");
    let mediaRequestCancelled = false;

    try {
      let currentToken = sessionToken;
      if (!currentToken) {
        const res = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ languageCode: "en" }),
        });
        if (!res.ok) throw new Error("Could not start your chat session.");
        const data = await res.json();
        currentToken = data.sessionToken;
        if (typeof currentToken !== "string" || !currentToken) {
          throw new Error("Could not start your chat session.");
        }
        localStorage.setItem("urban-cruise-chat-session", currentToken);
      }

      const socket = io(process.env.NEXT_PUBLIC_CHAT_REALTIME_URL || "http://localhost:5002", {
        auth: { sessionToken: currentToken },
      });
      socketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.off("connect", onConnect);
          socket.off("connect_error", onError);
          reject(new Error("Could not connect to the video-call service."));
        }, 8000);
        const onConnect = () => {
          clearTimeout(timeout);
          socket.off("connect_error", onError);
          resolve();
        };
        const onError = () => {
          clearTimeout(timeout);
          socket.off("connect", onConnect);
          reject(new Error("Could not connect to the video-call service."));
        };
        socket.once("connect", onConnect);
        socket.once("connect_error", onError);
      });

      const mediaPromise = Promise.resolve().then(
        () => navigator.mediaDevices.getUserMedia({ video: true, audio: true }),
      ).then(
        stream => {
          if (mediaRequestCancelled) {
            stream.getTracks().forEach(track => track.stop());
            return null;
          }
          streamRef.current = stream;
          return stream;
        },
        error => {
          console.warn("Video call media access was denied.", error);
          return null;
        },
      );

      socket.on("video:accept", async () => {
        const stream = await mediaPromise;
        if (!stream) {
          setCallError("Allow camera and microphone access to continue the video call.");
          return;
        }

        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        peerConnectionRef.current = pc;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.onicecandidate = event => {
          if (event.candidate) socket.emit("video:ice-candidate", { candidate: event.candidate });
        };
        pc.ontrack = event => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
          setRemoteConnected(true);
        };

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("video:offer", { offer });
        } catch (error) {
          console.error("Could not create the video-call offer.", error);
          setCallError("Could not connect the video call. Please try again.");
        }
      });
      socket.on("video:answer", async ({ answer }) => {
        try {
          await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
          console.error("Could not apply the video-call answer.", error);
          setCallError("Could not connect the video call. Please try again.");
        }
      });
      socket.on("video:ice-candidate", async ({ candidate }) => {
        try {
          await peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error("Could not apply a video-call network candidate.", error);
        }
      });

      setInCall(true);
      setStep(3);
      const requestResponse = await fetch("/api/chat/video-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: currentToken, name: formData.name, email: formData.email })
      });
      if (!requestResponse.ok) {
        throw new Error("Could not notify an agent. Please try again.");
      }

      const stream = await mediaPromise;
      if (stream && localVideoRef.current) localVideoRef.current.srcObject = stream;
      if (!stream) {
        setCallError("Your request was sent, but camera and microphone access is needed to continue.");
      }
    } catch (err) {
      mediaRequestCancelled = true;
      console.error("Could not start the video call.", err);
      socketRef.current?.disconnect();
      socketRef.current = null;
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setInCall(false);
      setStep(2);
      setCallError(err instanceof Error ? err.message : "Could not start the video call. Please try again.");
    } finally {
      setStartingCall(false);
    }
  };

  const endCall = () => {
    socketRef.current?.disconnect();
    peerConnectionRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setInCall(false);
    setRemoteConnected(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="relative flex h-[600px] w-full max-w-sm flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex justify-between border-b px-4 py-3">
          <span className="text-sm font-bold">Video Chat</span>
          <button onClick={endCall}><FaTimes /></button>
        </div>

        <div className="flex-1 p-5 bg-white flex flex-col">
          {step === 1 && (
            <form onSubmit={(e) => { e.preventDefault(); setStep(2); }} className="flex flex-col h-full">
              <input type="text" placeholder="Name" required onChange={e => setFormData({...formData, name: e.target.value})} className="mb-3 w-full border p-2 rounded" />
              <input type="email" placeholder="Email" required onChange={e => setFormData({...formData, email: e.target.value})} className="mb-3 w-full border p-2 rounded" />
              <button type="submit" className="mt-auto w-full bg-[#F59E0B] text-white font-bold py-3 rounded-full">JOIN NOW</button>
            </form>
          )}

          {step === 2 && (
            <div className="flex flex-col h-full justify-center">
              {callError && <p role="alert" className="mb-4 text-center text-sm text-red-600">{callError}</p>}
              <button onClick={startVideoCall} disabled={startingCall} className="w-full bg-[#F59E0B] text-white font-bold py-3 rounded-full disabled:opacity-60">
                <FaVideo className="inline mr-2"/> {startingCall ? "CONNECTING..." : "VIDEO CALL NOW"}
              </button>
            </div>
          )}

          {step === 3 && inCall && (
            <div className="flex flex-col h-full">
              <div className="relative flex-1 bg-slate-900 rounded-xl overflow-hidden mb-4">
                <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
                {!remoteConnected && (
                  <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-white">
                    {callError || "Waiting for Agent to accept..."}
                  </div>
                )}
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-3 right-3 h-28 w-20 rounded-lg border-2 border-slate-700 bg-black object-cover" />
              </div>
              <div className="flex justify-center gap-4">
                <button onClick={endCall} className="h-12 w-12 rounded-full bg-red-500 text-white flex items-center justify-center"><FaTimes /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}