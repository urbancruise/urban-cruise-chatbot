"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const ChatWidget = dynamic(() => import("./ChatWidget"), {
  ssr: false,
  loading: () => null,
});

export default function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (loaded && !open) launcherRef.current?.focus();
  }, [loaded, open]);

  function showChat() {
    setLoaded(true);
    setOpen(true);
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        aria-label={open ? "Close Urban Cruise support chat" : "Open Urban Cruise support chat"}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : showChat())}
        className="fixed bottom-5 right-5 z-40 flex h-14 items-center gap-3 rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-xl transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
      >
        <span aria-hidden="true" className="text-xl">✦</span>
        <span>{open ? "Close chat" : "Chat with us"}</span>
      </button>
      {loaded && <ChatWidget open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
