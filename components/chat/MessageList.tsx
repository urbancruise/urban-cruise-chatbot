"use client";

import QuickReplies, { type QuickReply } from "./QuickReplies";

export interface ChatMessage {
  id: string;
  author: "assistant" | "agent" | "user";
  text: string;
  replies?: QuickReply[];
}

export default function MessageList({
  messages,
  onReply,
  isTyping,
  typingLabel,
}: {
  messages: ChatMessage[];
  onReply: (reply: QuickReply) => void;
  isTyping: boolean;
  typingLabel: string;
}) {
  return (
    <ol
      className="flex-1 space-y-4 overflow-y-auto px-4 py-5"
      aria-label="Chat messages"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {messages.map((message) => (
        <li
          key={message.id}
          className={`flex ${message.author === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
              message.author === "user"
                ? "rounded-br-sm bg-emerald-800 text-white"
                : "rounded-bl-sm bg-stone-100 text-slate-900"
            }`}
          >
            {message.author === "agent" && (
              <span className="mb-1 block text-xs font-semibold text-emerald-900">
                Urban Cruise agent
              </span>
            )}
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
            {message.author === "assistant" && message.replies && (
              <QuickReplies replies={message.replies} onSelect={onReply} />
            )}
          </div>
        </li>
      ))}
      {isTyping && (
        <li className="flex justify-start" role="status" aria-label={typingLabel}>
          <div className="rounded-2xl rounded-bl-sm bg-stone-100 px-4 py-3 text-sm text-slate-700">
            <span className="animate-pulse">{typingLabel}</span>
          </div>
        </li>
      )}
    </ol>
  );
}
