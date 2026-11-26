"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { FaMessage } from "react-icons/fa6";

const ChatWidget = dynamic(() => import("./ChatWidget"), {
  ssr: false,
  loading: () => null,
});

export default function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Focus management: When chat is closed, focus returns to the launcher
  useEffect(() => {
    if (loaded && !open) launcherRef.current?.focus();
  }, [loaded, open]);

  function showChat() {
    setLoaded(true);
    setOpen(true);
  }

  return (
    <>
      {/* 
        The `!open` condition ensures this button is completely hidden 
        from the DOM when the chat window is open.
      */}
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          aria-label="Open Urban Cruise support chat"
          aria-expanded={open}
          onClick={showChat}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#03C35E] text-white shadow-xl transition-all hover:scale-105 hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#03C35E]"
        >
          <FaMessage className="h-6 w-6" />
        </button>
      )}

      {/* 
        The ChatWidget is dynamically loaded when clicked. 
        It receives the `open` state and the `onClose` handler to manage its visibility.
      */}
      {loaded && <ChatWidget open={open} onClose={() => setOpen(false)} />}
    </>
  );
}