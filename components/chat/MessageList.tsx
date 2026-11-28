"use client";

import { FaRobot, FaUser } from "react-icons/fa";
import QuickReplies, { type QuickReply } from "./QuickReplies";

export interface ChatMessage {
  id: string;
  author: "user" | "assistant" | "agent";
  text: string;
  replies?: QuickReply[];
}

function Avatar({ type }: { type: "user" | "agent" | "assistant" }) {
  const isUser = type === "user";
  const bgColor = isUser ? "bg-slate-200" : "bg-emerald-100";
  const iconColor = isUser ? "text-slate-500" : "text-[#03C35E]";

  return (
    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full ${bgColor} ${iconColor}`}>
      {isUser ? <FaUser className="h-4 w-4" /> : <FaRobot className="h-4 w-4" />}
    </div>
  );
}

export default function MessageList({
  messages,
  onReply,
}: {
  messages: ChatMessage[];
  onReply: (reply: QuickReply) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.map((message, index) => {
        const isUser = message.author === "user";

        return (
          <div
            key={message.id || index}
            className={`flex w-full items-end gap-2 ${
              isUser ? "justify-end" : "justify-start"
            }`}
          >
            {/* Left Side Avatar (Agent / Bot) */}
            {!isUser && <Avatar type={message.author} />}

            {/* Message Bubble */}
            <div
              className={`flex max-w-[75%] flex-col rounded-2xl px-4 py-3 text-sm shadow-sm ${
                isUser
                  ? "rounded-br-sm bg-[#03C35E] text-white" // User bubble
                  : message.author === "agent"
                  ? "rounded-bl-sm bg-emerald-600 text-white" // Live Agent bubble
                  : "rounded-bl-sm border border-stone-100 bg-white text-slate-800" // Bot bubble
              }`}
            >
              {/* Optional: Add a small label above bot/agent messages */}
              {!isUser && (
                <span className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-80">
                  {message.author === "agent" ? "Support Agent" : "Urban Cruise"}
                </span>
              )}

              <p className="whitespace-pre-wrap break-words">{message.text}</p>

              {message.replies && message.replies.length > 0 && (
                <QuickReplies replies={message.replies} onSelect={onReply} />
              )}
            </div>

            {/* Right Side Avatar (User) */}
            {isUser && <Avatar type="user" />}
          </div>
        );
      })}
    </div>
  );
}