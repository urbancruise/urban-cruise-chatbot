"use client";

export interface QuickReply {
  type: string;
  label: string;
  value?: string | number;
}

export default function QuickReplies({
  replies,
  onSelect,
}: {
  replies: QuickReply[];
  onSelect: (reply: QuickReply) => void;
}) {
  if (!replies.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested actions">
      {replies.map((reply, index) => (
        <button
          key={`${reply.type}-${reply.value ?? reply.label}-${index}`}
          type="button"
          onClick={() => onSelect(reply)}
          className="rounded-full border border-emerald-800/30 bg-white px-3 py-2 text-left text-xs font-medium text-emerald-950 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          {reply.label}
        </button>
      ))}
    </div>
  );
}
