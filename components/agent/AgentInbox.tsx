"use client";

import { useEffect, useState, type FormEvent } from "react";

interface Agent {
  id: string;
  username: string;
  displayName: string;
}

interface Conversation {
  id: string;
  location_slug: string;
  agent_chat_status: "waiting" | "active";
  assigned_agent_name: string | null;
  last_message: string | null;
  last_message_type: "user" | "assistant" | "agent" | null;
  last_activity_at: string;
}

interface ConversationResponse extends Omit<Conversation, "id"> {
  id: number | string;
}

interface LocationCount {
  location_slug: string;
  conversation_count: number;
}

interface InboxMessage {
  id: string;
  author: "user" | "assistant" | "agent";
  text: string;
  createdAt: string;
}

const COMMON_LOCATION_SLUGS = ["delhi", "mumbai", "gurugram", "pune", "global"];

export default function AgentInbox() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [locationCounts, setLocationCounts] = useState<LocationCount[]>([]);
  const [locationFilter, setLocationFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const response = await fetch("/api/agent/auth", { cache: "no-store" });
        if (response.status === 401) return;
        if (!response.ok) throw new Error("Agent service is temporarily unavailable.");
        const data = await response.json();
        if (active) setAgent(data.agent as Agent);
      } catch (sessionError) {
        if (active) {
          setError(sessionError instanceof Error ? sessionError.message : "Could not load agent session.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!agent) return;
    let active = true;
    let refreshing = false;

    async function refreshInbox() {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetch(
          `/api/agent/conversations?location=${encodeURIComponent(locationFilter)}`,
          { cache: "no-store" },
        );
        if (response.status === 401) {
          if (active) {
            setAgent(null);
            setError("Your agent session expired. Please sign in again.");
          }
          return;
        }
        if (!response.ok) throw new Error("Could not refresh the agent inbox.");
        const data = await response.json() as {
          conversations: ConversationResponse[];
          locationCounts: LocationCount[];
        };
        if (!active) return;
        const nextConversations = data.conversations.map((item) => ({
          ...item,
          id: String(item.id),
        }));
        setConversations(nextConversations);
        setLocationCounts(data.locationCounts);
        setError("");

        if (!selectedId) return;
        if (!nextConversations.some((item) => item.id === selectedId)) {
          setSelectedId("");
          setMessages([]);
          return;
        }
        const messageResponse = await fetch(`/api/agent/conversations/${selectedId}`, {
          cache: "no-store",
        });
        if (!messageResponse.ok) throw new Error("Could not refresh this conversation.");
        const messageData = await messageResponse.json() as { messages: InboxMessage[] };
        if (active) {
          setMessages(messageData.messages);
          setError("");
        }
      } catch (refreshError) {
        if (active) {
          setError(refreshError instanceof Error ? refreshError.message : "Could not refresh the inbox.");
        }
      } finally {
        refreshing = false;
      }
    }

    void refreshInbox();
    const timer = window.setInterval(() => void refreshInbox(), 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [agent, locationFilter, selectedId]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/agent/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        throw new Error(response.status === 401
          ? "Username or password is incorrect."
          : "Could not sign in. Please try again.");
      }
      const data = await response.json() as { agent: Agent };
      setAgent(data.agent);
      setPassword("");
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Could not sign in.");
    }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/agent/auth", { method: "DELETE" });
      if (!response.ok) {
        setError("Could not sign out. Please try again.");
        return;
      }
      setAgent(null);
      setConversations([]);
      setLocationCounts([]);
      setMessages([]);
      setSelectedId("");
    } catch {
      setError("Could not sign out. Please try again.");
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!selectedId || !text || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/agent/conversations/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json() as {
        message: Omit<InboxMessage, "createdAt">;
      };
      if (!response.ok) {
        throw new Error(response.status === 409
          ? "Another agent has taken this conversation."
          : "Your reply could not be sent.");
      }
      setMessages((current) => [
        ...current,
        { ...data.message, createdAt: new Date().toISOString() },
      ]);
      setDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Your reply could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function closeConversation() {
    if (!selectedId) return;
    try {
      const response = await fetch(`/api/agent/conversations/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (!response.ok) {
        setError("This conversation could not be closed.");
        return;
      }
      setSelectedId("");
      setMessages([]);
    } catch {
      setError("This conversation could not be closed.");
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-700">Loading agent inbox…</main>;
  }

  if (!agent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8f5] px-4 text-slate-950">
        <form onSubmit={signIn} className="w-full max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-xl font-bold">Urban Cruise agent sign in</h1>
            <p className="mt-1 text-sm text-slate-600">Daytime inbox · 09:00–21:00 IST</p>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}
          <label className="block text-sm font-medium">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              minLength={12}
              required
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          <button type="submit" className="w-full rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900">
            Sign in
          </button>
        </form>
      </main>
    );
  }

  function formatLocationLabel(locationSlug: string) {
    if (locationSlug === "all") return "All";
    if (locationSlug === "global") return "Global";
    return locationSlug
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  const selectedConversation = conversations.find((item) => item.id === selectedId);
  const allConversationCount = locationCounts.reduce(
    (total, item) => total + item.conversation_count,
    0,
  );
  const countsByLocation = new Map(
    locationCounts.map((item) => [item.location_slug, item.conversation_count]),
  );
  const locationFilters = [
    { location_slug: "all", conversation_count: allConversationCount },
    ...Array.from(new Set([
      ...COMMON_LOCATION_SLUGS,
      ...locationCounts.map((item) => item.location_slug),
    ])).map((location_slug) => ({
      location_slug,
      conversation_count: countsByLocation.get(location_slug) ?? 0,
    })),
  ];

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f8f5] text-slate-950">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
        <div>
          <h1 className="text-lg font-bold">Urban Cruise agent inbox</h1>
          <p className="text-xs text-slate-600">Daytime support · 09:00–21:00 IST</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">{agent.displayName}</span>
          <button type="button" onClick={() => void signOut()} className="rounded-md border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50">
            Sign out
          </button>
        </div>
      </header>

      {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-900">{error}</p>}

      <div className="grid min-h-0 flex-1 md:grid-cols-[320px_1fr]">
        <aside className="border-b border-stone-200 bg-white md:border-b-0 md:border-r">
          <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">
            Conversations ({conversations.length})
          </h2>
          <nav className="flex gap-2 overflow-x-auto border-b border-stone-200 px-3 py-2" aria-label="Filter conversations by location">
            {locationFilters.map((item) => (
              <button
                key={item.location_slug}
                type="button"
                onClick={() => setLocationFilter(item.location_slug)}
                aria-pressed={locationFilter === item.location_slug}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  locationFilter === item.location_slug
                    ? "bg-emerald-800 text-white"
                    : "bg-stone-100 text-slate-700 hover:bg-emerald-50"
                }`}
              >
                {formatLocationLabel(item.location_slug)} ({item.conversation_count})
              </button>
            ))}
          </nav>
          <ul className="max-h-[40vh] overflow-y-auto md:max-h-[calc(100vh-7rem)]">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(conversation.id);
                    setMessages([]);
                  }}
                  aria-current={selectedId === conversation.id ? "true" : undefined}
                  className={`w-full border-b border-stone-100 px-4 py-3 text-left hover:bg-emerald-50 ${
                    selectedId === conversation.id ? "bg-emerald-50" : "bg-white"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                      {conversation.agent_chat_status}
                    </span>
                    <span className="text-[11px] text-slate-500">Chat {conversation.id}</span>
                  </span>
                  <span className="mt-1 block truncate text-sm text-slate-800">
                    {formatLocationLabel(conversation.location_slug)} · {conversation.last_message || "No messages"}
                  </span>
                </button>
              </li>
            ))}
            {conversations.length === 0 && (
              <li className="px-4 py-6 text-sm text-slate-600">No open conversations. New daytime chats will appear here.</li>
            )}
          </ul>
        </aside>

        <section className="flex min-h-[50vh] flex-col">
          {selectedConversation ? (
            <>
              <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-3">
                <div>
                  <h2 className="font-semibold">Chat {selectedConversation.id}</h2>
                  <p className="text-xs text-slate-600">
                    {formatLocationLabel(selectedConversation.location_slug)} · {selectedConversation.assigned_agent_name
                      ? `Assigned to ${selectedConversation.assigned_agent_name}`
                      : "Waiting for an agent"}
                  </p>
                </div>
                <button type="button" onClick={() => void closeConversation()} className="rounded-md border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50">
                  Close conversation
                </button>
              </header>
              <ol className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-label="Conversation messages">
                {messages.map((message) => (
                  <li key={message.id} className={`flex ${message.author === "user" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                      message.author === "user" ? "bg-white text-slate-900" : "bg-emerald-800 text-white"
                    }`}>
                      <p className="mb-1 text-xs font-semibold opacity-80">
                        {message.author === "user" ? "Customer" : message.author === "agent" ? "Agent" : "Chatbot"}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{message.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <form onSubmit={sendReply} className="flex gap-2 border-t border-stone-200 bg-white p-3">
                <label className="sr-only" htmlFor="agent-reply">Reply to customer</label>
                <input
                  id="agent-reply"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={2000}
                  placeholder="Type your reply…"
                  disabled={sending}
                  className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
                <button type="submit" disabled={sending || !draft.trim()} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Reply
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">
              Select a conversation to view and reply.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
