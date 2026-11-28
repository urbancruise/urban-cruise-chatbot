"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from "react";
import { io } from "socket.io-client";
import { FaTimes } from "react-icons/fa";
import { HiSparkles } from "react-icons/hi2";
import { welcomeMenu } from "@/lib/chat/content";
import type { ChatMessage } from "./MessageList";
import type { QuickReply } from "./QuickReplies";
import FaqSearch from "./FaqSearch";
import LeadForm, { type LeadFormValues } from "./LeadForm";
import MessageList from "./MessageList";

interface ChatConfig {
  mode: "day" | "night";
  menu: typeof welcomeMenu;
  welcomeMessage: { en: string; hi: string };
  consent?: { version: string };
}

interface Category {
  id: number;
  slug: string;
  name: { en: string; hi: string };
}

export default function ChatWidget({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [languageCode, setLanguageCode] = useState<"en" | "hi">("en");
  const [sessionToken, setSessionToken] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showFaqSearch, setShowFaqSearch] = useState(false);
  const [categoryMenu, setCategoryMenu] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [sending, setSending] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [draft, setDraft] = useState("");

  // --- DRAG STATE & REFS ---
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const leadIdempotencyKey = useRef<string | null>(null);
  const initialLanguage = useRef(languageCode);
  const agentTypingTimer = useRef<number | null>(null);

  // --- DRAG HANDLERS ---
  const handleDragStart = (e: ReactMouseEvent | ReactTouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select') || target.closest('input')) return;

    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as ReactMouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as ReactMouseEvent).clientY;
    
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;

    setPosition({
      x: dragRef.current.initialX + dx,
      y: dragRef.current.initialY + dy,
    });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchmove", handleDragMove, { passive: false });
      window.addEventListener("touchend", handleDragEnd);
    } else {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("touchend", handleDragEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);
  // --- END DRAG HANDLERS ---

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const [configResponse, categoriesResponse] = await Promise.all([
          fetch("/api/chat/config", { cache: "no-store" }),
          fetch("/api/chat/faqs/categories", { cache: "no-store" }),
        ]);
        if (!configResponse.ok || !categoriesResponse.ok) {
          throw new Error("Chat service is temporarily unavailable. Please try again later.");
        }
        const [configData, categoryData] = await Promise.all([
          configResponse.json(),
          categoriesResponse.json(),
        ]);
        const storedToken = window.localStorage.getItem("urban-cruise-chat-session");
        let history: ChatMessage[] = [];
        let token = "";
        let tokenToPersist = "";
        if (storedToken && /^[a-f0-9]{64}$/i.test(storedToken)) {
          const historyResponse = await fetch("/api/chat/messages", {
            headers: { Authorization: `Bearer ${storedToken}` },
            cache: "no-store",
          });
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            history = historyData.messages as ChatMessage[];
            token = storedToken;
          } else if (historyResponse.status !== 401) {
            throw new Error("Chat history could not be loaded. Please try again later.");
          }
        }
        if (!token) {
          const sessionResponse = await fetch("/api/chat/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ languageCode: initialLanguage.current }),
          });
          if (!sessionResponse.ok) {
            throw new Error("Chat service is temporarily unavailable. Please try again later.");
          }
          const sessionData = await sessionResponse.json();
          token = sessionData.sessionToken as string;
          tokenToPersist = token;
        }
        if (!active) return;
        if (tokenToPersist) {
          window.localStorage.setItem("urban-cruise-chat-session", tokenToPersist);
        }
        setConfig(configData as ChatConfig);
        setCategories(categoryData.categories as Category[]);
        setSessionToken(token);
        setMessages(history.length > 0 ? history : [{
          id: "welcome",
          author: "assistant",
          text: (configData as ChatConfig).welcomeMessage[initialLanguage.current],
        }]);
      } catch (initializeError) {
        if (!active) return;
        setError(
          initializeError instanceof Error
            ? initializeError.message
            : "Chat service is temporarily unavailable.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const realtimeUrl = process.env.NEXT_PUBLIC_CHAT_REALTIME_URL;
    if (!open || config?.mode !== "day" || !sessionToken || !realtimeUrl) return;

    const socket = io(realtimeUrl, {
      auth: { sessionToken },
      reconnection: true,
      timeout: 5000,
    });
    socket.on("connect", () => {
      setRealtimeConnected(true);
      setPollError("");
    });
    socket.on("disconnect", () => {
      setRealtimeConnected(false);
      setAgentTyping(false);
    });
    socket.on("connect_error", () => setRealtimeConnected(false));
    socket.on("chat:agent-message", (event: unknown) => {
      if (!event || typeof event !== "object") return;
      const message = event as { id?: unknown; author?: unknown; text?: unknown };
      if (typeof message.id !== "string" || typeof message.text !== "string") return;
      const id = message.id;
      const text = message.text;
      setAgentTyping(false);
      if (agentTypingTimer.current !== null) {
        window.clearTimeout(agentTypingTimer.current);
        agentTypingTimer.current = null;
      }
      setMessages((current) => current.some((item) => item.id === message.id)
        ? current
        : [...current, { id, author: "agent", text }]);
    });
    socket.on("agent:typing", (event: unknown) => {
      if (!event || typeof event !== "object" || typeof (event as { typing?: unknown }).typing !== "boolean") return;
      const typing = (event as { typing: boolean }).typing;
      setAgentTyping(typing);
      if (agentTypingTimer.current !== null) window.clearTimeout(agentTypingTimer.current);
      if (typing) {
        agentTypingTimer.current = window.setTimeout(() => {
          setAgentTyping(false);
          agentTypingTimer.current = null;
        }, 3000);
      }
    });

    return () => {
      socket.disconnect();
      if (agentTypingTimer.current !== null) {
        window.clearTimeout(agentTypingTimer.current);
        agentTypingTimer.current = null;
      }
    };
  }, [open, config?.mode, sessionToken]);

  useEffect(() => {
    if (!open || config?.mode !== "day" || !sessionToken) return;
    let active = true;
    let polling = false;

    async function checkForAgentReplies() {
      if (polling) return;
      polling = true;
      try {
        const response = await fetch("/api/chat/messages", {
          headers: { Authorization: `Bearer ${sessionToken}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Agent replies are temporarily unavailable.");
        const data = await response.json();
        const agentMessages = (data.messages as ChatMessage[]).filter(
          (message) => message.author === "agent",
        );
        if (!active) return;
        setMessages((current) => {
          const currentIds = new Set(current.map((message) => message.id));
          const newMessages = agentMessages.filter((message) => !currentIds.has(message.id));
          return newMessages.length ? [...current, ...newMessages] : current;
        });
        setPollError("");
      } catch {
        if (active) {
          setPollError(
            languageCode === "hi"
              ? "एजेंट से कनेक्शन अभी उपलब्ध नहीं है।"
              : "Live agent connection is temporarily unavailable.",
          );
        }
      } finally {
        polling = false;
      }
    }

    void checkForAgentReplies();
    const timer = window.setInterval(
      () => void checkForAgentReplies(),
      realtimeConnected ? 15000 : 5000,
    );
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open, config?.mode, sessionToken, languageCode, realtimeConnected]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const addMessage = useCallback((author: ChatMessage["author"], text: string, replies?: QuickReply[]) => {
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random()}`, author, text, replies },
    ]);
  }, []);

  async function postMessage(input: { text?: string; faqId?: number; categoryId?: number }) {
    if (!sessionToken) {
      setError("Chat session is not ready. Please close and reopen the chat.");
      return;
    }
    setSending(true);
    setError("");
    if (input.text) addMessage("user", input.text);
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, sessionToken, languageCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error("Your message could not be sent. Please try again.");
      const result = data.response as {
        text: string;
        quickReplies: QuickReply[];
        relatedQuestions?: Array<{ id: number; question: string }>;
      };
      const replies = [
        ...result.quickReplies,
        ...(result.relatedQuestions ?? []).map((faq) => ({
          type: "faq",
          label: faq.question,
          value: faq.id,
        })),
      ];
      if (result.text) addMessage("assistant", result.text, replies);
      if (data.queued === false) {
        setAgentTyping(true);
        if (agentTypingTimer.current !== null) window.clearTimeout(agentTypingTimer.current);
        agentTypingTimer.current = window.setTimeout(() => {
          setAgentTyping(false);
          agentTypingTimer.current = null;
        }, 30000);
      }
      if (config && data.mode !== config.mode) setConfig({ ...config, mode: data.mode });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  function selectReply(reply: QuickReply) {
    setShowLeadForm(false);
    if (reply.type === "lead") {
      setShowLeadForm(true);
    } else if (reply.type === "category" && typeof reply.value === "number") {
      void postMessage({ text: reply.label, categoryId: reply.value });
    } else if (reply.type === "faq" && typeof reply.value === "number") {
      void postMessage({ text: reply.label, faqId: reply.value });
    } else if (reply.type === "support") {
      void postMessage({ text: languageCode === "hi" ? "सहायता से बात करें" : "Talk to Support" });
    }
  }

  async function handleLeadSubmit(values: LeadFormValues) {
    if (!sessionToken) {
      throw new Error(languageCode === "hi"
        ? "चैट सत्र तैयार नहीं है। कृपया फिर कोशिश करें।"
        : "Your chat session is not ready. Please try again.");
    }

    const idempotencyKey = leadIdempotencyKey.current ?? crypto.randomUUID();
    leadIdempotencyKey.current = idempotencyKey;
    const response = await fetch("/api/chat/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        sessionToken,
        idempotencyKey,
        languageCode,
      }),
    });
    const data = await response.json() as { confirmation?: unknown };
    if (!response.ok) {
      throw new Error(languageCode === "hi"
        ? "आपकी पूछताछ भेजी नहीं जा सकी। कृपया फिर कोशिश करें।"
        : "Your enquiry could not be sent. Please try again.");
    }
    if (typeof data.confirmation !== "string") {
      throw new Error(languageCode === "hi"
        ? "पूछताछ की पुष्टि नहीं मिल सकी। कृपया फिर कोशिश करें।"
        : "The enquiry confirmation was missing. Please try again.");
    }

    addMessage("assistant", data.confirmation);
    leadIdempotencyKey.current = null;
    setShowLeadForm(false);
  }

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    void postMessage({ text: draft.trim() });
    setDraft("");
  }

  if (!open) return null;
  if (loading) return (
    <div className="fixed bottom-24 right-5 z-50 flex h-[600px] w-[380px] flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-2xl">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#03C35E] border-t-transparent"></div>
      <p className="mt-4 text-sm text-slate-500">Loading chat...</p>
    </div>
  );

  return (
    <aside
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Urban Cruise chat support"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      className={`fixed bottom-24 right-5 z-50 flex h-[600px] w-[380px] flex-col overflow-hidden rounded-2xl bg-[#f7f8f5] shadow-2xl ${
        isDragging ? "cursor-grabbing select-none" : ""
      }`}
    >
      {/* --- PREMIUM DRAGGABLE HEADER START --- */}
      <header 
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className="relative flex flex-col bg-[#0a192f] text-white shadow-md z-10 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 pointer-events-none">
            {/* Agent Avatar with Active Status */}
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10">
                <Image
                  src="/image/robot-uc.webp"
                  alt="Urban Cruise Support"
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0a192f] bg-[#03C35E]"></span>
            </div>

            <div className="flex flex-col">
              <h2 className="text-sm font-bold tracking-wide text-white">
                Urban Cruise
              </h2>
              <p className="text-[11px] font-medium text-slate-300">
                Agent support · 09:00–21:00 IST
              </p>
            </div>
          </div>

          {/* Right side Controls */}
          <div className="flex items-center gap-2 cursor-auto">
            <select
              value={languageCode}
              onChange={(e) => setLanguageCode(e.target.value as "en" | "hi")}
              className="cursor-pointer rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs font-medium text-white outline-none backdrop-blur-sm transition hover:bg-white/20 focus:ring-2 focus:ring-[#03C35E] [&>option]:text-slate-900"
            >
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
            </select>

            <button
              ref={closeRef}
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Close chat"
            >
              <FaTimes className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Powered by XORA Ribbon */}
        <div className="flex items-center justify-center gap-1.5 bg-slate-50 py-1.5 text-[10px] font-semibold tracking-widest text-slate-500 border-b border-stone-200 pointer-events-none">
          <span>POWERED BY</span>
          <span className="flex items-center gap-1 text-[#0a192f]">
            XORA <HiSparkles className="h-3 w-3 text-[#03C35E]" />
          </span>
        </div>
      </header>
      {/* --- PREMIUM DRAGGABLE HEADER END --- */}

      {/* Message Area with Thin Scrollbar */}
      <div className="flex-1 overflow-y-auto 
        [&::-webkit-scrollbar]:w-1.5 
        [&::-webkit-scrollbar-track]:bg-transparent 
        [&::-webkit-scrollbar-thumb]:bg-stone-300 
        [&::-webkit-scrollbar-thumb]:rounded-full 
        hover:[&::-webkit-scrollbar-thumb]:bg-stone-400"
      >
        {error && (
          <div className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-900 border border-red-200">
            {error}
          </div>
        )}

        {pollError && (
          <div className="mx-4 mt-4 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 border border-amber-200 text-center">
            {pollError}
          </div>
        )}
        
        <MessageList messages={messages} onReply={selectReply} />
        
        {agentTyping && (
          <div className="px-6 pb-4 text-xs font-medium text-slate-500 animate-pulse">
            Agent is typing...
          </div>
        )}
      </div>

      {/* Lead Form & Search (Conditional) */}
      {showLeadForm && (
        <div className="border-t border-stone-200 bg-white p-4">
          <LeadForm
            onCancel={() => setShowLeadForm(false)}
            onSubmit={handleLeadSubmit}
            languageCode={languageCode}
          />
        </div>
      )}

      {/* Input Area */}
      {!showLeadForm && (
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 border-t border-stone-200 bg-white p-3">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your question..."
            disabled={sending}
            className="flex-1 rounded-xl border border-stone-300 bg-[#f7f8f5] px-4 py-2.5 text-sm outline-none transition focus:border-[#03C35E] focus:ring-1 focus:ring-[#03C35E]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#03C35E] text-white transition hover:bg-emerald-600 disabled:opacity-50"
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
      )}
    </aside>
  );
}