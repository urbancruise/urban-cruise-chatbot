"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { FaMessage, FaXmark } from "react-icons/fa6";
import { MdOutlineSupportAgent } from "react-icons/md";
import { HiOutlineVideoCamera } from "react-icons/hi";

const ChatWidget = dynamic(() => import("./ChatWidget"), { ssr: false });
const VideoCallWidget = dynamic(() => import("./VideoCallWidget"), { ssr: false });

export default function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sessionToken, setSessionToken] = useState("");

  // Jab bhi menu open ho, fresh token utha lein
  useEffect(() => {
    if (showMenu) {
      const token = localStorage.getItem("urban-cruise-chat-session") || "";
      setSessionToken(token);
    }
  }, [showMenu]);

  if (open) return <ChatWidget open={open} onClose={() => setOpen(false)} />;

  if (videoOpen) {
    return <VideoCallWidget onClose={() => setVideoOpen(false)} sessionToken={sessionToken} />;
  }

  return (
    <>
      {showMenu && <div className="fixed inset-0 z-40 bg-black/10" onClick={() => setShowMenu(false)} />}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-4">
        {showMenu && (
          <div className="flex w-[290px] flex-col gap-3">
            <button onClick={() => { setShowMenu(false); setVideoOpen(true); }} className="flex items-center gap-4 rounded-[20px] border bg-white p-3.5 shadow-lg">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-400">
                <HiOutlineVideoCamera className="h-5 w-5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[13px] font-bold">Video Chat</span>
                <span className="text-[11px] text-slate-500">Connect with a sales expert.</span>
              </div>
            </button>
            <button onClick={() => { setShowMenu(false); setLoaded(true); setOpen(true); }} className="flex items-center gap-4 rounded-[20px] border bg-white p-3.5 shadow-lg">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-[#03C35E]">
                <MdOutlineSupportAgent className="h-5 w-5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[13px] font-bold">24×7 Chat</span>
                <span className="text-[11px] text-slate-500">Instant answers.</span>
              </div>
            </button>
          </div>
        )}
        <button onClick={() => setShowMenu(p => !p)} className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl ${showMenu ? "bg-yellow-500" : "bg-[#03C35E]"}`}>
          {showMenu ? <FaXmark className="h-6 w-6" /> : <FaMessage className="h-6 w-6" />}
        </button>
      </div>
    </>
  );
}