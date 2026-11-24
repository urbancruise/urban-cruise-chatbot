"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [sending, setSending] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const leadIdempotencyKey = useRef<string | null>(null);
  const initialLanguage = useRef(languageCode);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const [configResponse, categoriesResponse, sessionResponse] = await Promise.all([
          fetch("/api/chat/config", { cache: "no-store" }),
          fetch("/api/chat/faqs/categories", { cache: "no-store" }),
          fetch("/api/chat/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ languageCode: initialLanguage.current }),
          }),
        ]);
        if (!configResponse.ok || !categoriesResponse.ok || !sessionResponse.ok) {
          throw new Error("Chat service is temporarily unavailable. Please try again later.");
        }
        const [configData, categoryData, sessionData] = await Promise.all([
          configResponse.json(),
          categoriesResponse.json(),
          sessionResponse.json(),
        ]);
        if (!active) return;
        setConfig(configData as ChatConfig);
        setCategories(categoryData.categories as Category[]);
        setSessionToken(sessionData.sessionToken as string);
        setMessages([
          {
            id: "welcome",
            author: "assistant",
            text: (configData as ChatConfig).welcomeMessage[initialLanguage.current],
          },
        ]);
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
      addMessage("assistant", result.text, replies);
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
    } else if (reply.type === "menu") {
      setCategoryMenu(categories);
      setShowFaqSearch(false);
    }
  }

  function selectMenuItem(id: string) {
    setShowLeadForm(false);
    setShowFaqSearch(false);
    setCategoryMenu([]);
    if (id === "booking") {
      setShowLeadForm(true);
    } else if (id === "faqs") {
      setShowFaqSearch(true);
      addMessage("assistant", languageCode === "hi" ? "स्वीकृत उत्तर खोजें या कोई विषय चुनें।" : "Search approved answers or choose a topic.");
      setCategoryMenu(categories);
    } else if (id === "support") {
      void postMessage({ text: languageCode === "hi" ? "सहायता से बात करें" : "Talk to Support" });
    } else {
      const slugsByAction: Record<string, string[]> = {
        "vehicle-info": ["vehicle-rental", "cars-suvs", "luxury-cars-vans", "tempo-traveller-urbania", "buses"],
        pricing: ["pricing-packages"],
        events: ["wedding", "corporate"],
        trips: ["local-outstation"],
        pilgrimage: ["pilgrimage"],
      };
      const menuCategories = categories.filter((category) => slugsByAction[id]?.includes(category.slug));
      setCategoryMenu(menuCategories);
    }
  }

  async function submitLead(values: LeadFormValues) {
    if (!sessionToken) throw new Error("Chat session is not ready. Please try again.");
    leadIdempotencyKey.current ??= crypto.randomUUID();
    const response = await fetch("/api/chat/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        sessionToken,
        idempotencyKey: leadIdempotencyKey.current,
        languageCode,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        languageCode === "hi"
          ? "पूछताछ भेजी नहीं जा सकी। कृपया जानकारी जाँचें और फिर कोशिश करें।"
          : "Your enquiry could not be sent. Check the details and try again.",
      );
    }
    addMessage("assistant", data.confirmation as string);
    leadIdempotencyKey.current = null;
    setShowLeadForm(false);
  }

  function changeLanguage(nextLanguage: "en" | "hi") {
    setLanguageCode(nextLanguage);
    setMessages((current) =>
      current.length === 1 && current[0].id === "welcome" && config
        ? [{ ...current[0], text: config.welcomeMessage[nextLanguage] }]
        : current,
    );
  }

  const isHindi = languageCode === "hi";
  const activeMenu = config?.menu ?? welcomeMenu;

  return (
    <section
      ref={dialogRef}
      role="dialog"
      aria-modal={open}
      aria-labelledby="urban-chat-title"
      aria-hidden={!open}
      hidden={!open}
      className="fixed bottom-24 right-4 z-50 flex h-[min(680px,calc(100dvh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl sm:bottom-24 sm:right-6"
    >
      <header className="flex items-center justify-between bg-slate-950 px-4 py-3 text-white">
        <div>
          <h2 id="urban-chat-title" className="text-sm font-bold">Urban Cruise</h2>
          <p className="mt-0.5 text-xs text-slate-200">
            {loading
              ? "Connecting…"
              : !config
                ? "Service unavailable"
                : config.mode === "day"
                  ? "Support queue placeholder"
                  : "Automated support"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="chat-language">Language</label>
          <select
            id="chat-language"
            value={languageCode}
            onChange={(event) => changeLanguage(event.target.value as "en" | "hi")}
            className="rounded-md border border-white/40 bg-slate-900 px-2 py-1 text-xs text-white focus:outline-2 focus:outline-white"
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="rounded-md p-2 text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-700" role="status">
          {isHindi ? "चैट लोड हो रही है..." : "Loading chat…"}
        </div>
      ) : error && !config ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-slate-800" role="alert">{error}</p>
          <button type="button" onClick={onClose} className="rounded-lg border border-emerald-800 px-4 py-2 text-sm font-semibold text-emerald-950">Close</button>
        </div>
      ) : (
        <>
          {error && <p className="bg-red-50 px-4 py-2 text-xs text-red-900" role="alert">{error}</p>}
          <MessageList messages={messages} onReply={selectReply} />

          {messages.length <= 1 && (
            <nav className="border-t border-stone-200 px-4 py-3" aria-label={isHindi ? "मुख्य मेनू" : "Main menu"}>
              <p className="mb-2 text-xs font-semibold text-slate-800">{isHindi ? "मैं इसमें सहायता कर सकता हूँ:" : "I can help with:"}</p>
              <div className="flex flex-wrap gap-2">
                {activeMenu.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectMenuItem(item.id)}
                    className="rounded-full border border-emerald-800/30 bg-white px-3 py-2 text-left text-xs font-medium text-emerald-950 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
                  >
                    {isHindi ? item.hi : item.en}
                  </button>
                ))}
              </div>
            </nav>
          )}

          {categoryMenu.length > 0 && (
            <div className="border-t border-stone-200 px-4 py-3" aria-label={isHindi ? "विषय चुनें" : "Choose a topic"}>
              <div className="flex flex-wrap gap-2">
                {categoryMenu.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setCategoryMenu([]);
                      void postMessage({
                        text: isHindi ? category.name.hi : category.name.en,
                        categoryId: category.id,
                      });
                    }}
                    className="rounded-full border border-emerald-800/30 px-3 py-2 text-xs font-medium text-emerald-950 hover:bg-emerald-50"
                  >
                    {isHindi ? category.name.hi : category.name.en}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showFaqSearch && <FaqSearch languageCode={languageCode} onSelect={(faq) => void postMessage({ text: faq.question, faqId: faq.id })} />}
          {showLeadForm && (
            <LeadForm
              languageCode={languageCode}
              onSubmit={submitLead}
              onCancel={() => setShowLeadForm(false)}
            />
          )}

          {!showLeadForm && (
            <form
              className="flex items-center gap-2 border-t border-stone-200 px-3 py-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                const text = String(data.get("chat-message") ?? "").trim();
                if (!text || sending) return;
                void postMessage({ text });
                form.reset();
              }}
            >
              <label className="sr-only" htmlFor="chat-message">{isHindi ? "अपना प्रश्न लिखें" : "Type your question"}</label>
              <input
                id="chat-message"
                name="chat-message"
                type="text"
                maxLength={1000}
                disabled={!sessionToken || sending}
                placeholder={isHindi ? "अपना प्रश्न लिखें..." : "Type your question..."}
                className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm text-slate-950 placeholder:text-slate-500 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:bg-stone-100"
              />
              <button
                type="submit"
                disabled={!sessionToken || sending}
                className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                {isHindi ? "भेजें" : "Send"}
              </button>
            </form>
          )}
          <p className="bg-stone-50 px-4 py-2 text-center text-[10px] text-slate-600">
            {isHindi ? "चैट में OTP, पासवर्ड या कार्ड विवरण साझा न करें।" : "Never share OTPs, passwords, or card details in chat."}
          </p>
        </>
      )}
    </section>
  );
}
