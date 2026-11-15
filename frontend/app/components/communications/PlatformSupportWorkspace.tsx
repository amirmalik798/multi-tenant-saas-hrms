"use client";

import { useCallback, useEffect, useState, useRef, type FormEvent, type KeyboardEvent } from "react";
import { Building2, Check, CheckCheck, CircleHelp, Inbox, LoaderCircle, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { SuperAdminOrganizationLogo } from "../super-admin/SuperAdminImages";

type Conversation = {
  id: string;
  organizationId: string;
  organizationName: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  createdByUserId: string;
  createdByName: string;
  lastMessage: string;
  unreadCount: number;
};
type Message = {
  id: string;
  senderUserId: string;
  senderName: string;
  senderRole: string;
  body: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
};
type InboxPayload = { message?: string; currentUserId?: string; conversations?: Conversation[]; mode?: string; unreadTotal?: number; pagination?: { page?: number; pageSize?: number; total?: number; totalPages?: number } };
type ThreadPayload = {
  message?: string;
  currentUserId?: string;
  mode?: string;
  conversation?: { id: string; organizationId: string; organizationName: string; subject: string; status: string };
  messages?: Message[];
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const payload = await response.json().catch(() => null) as T | null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
      ? payload.message : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!payload) throw new Error("The server returned an unreadable response.");
  return payload;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function displayRole(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, sending: boolean) {
  // Enter sends; Shift+Enter inserts a newline. Ignore IME composition so
  // East Asian input methods can confirm text without sending the message.
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  if (!sending) event.currentTarget.form?.requestSubmit();
}

export default function PlatformSupportWorkspace({ role }: { role: "ORGANIZATION_ADMIN" | "SUPER_ADMIN" }) {
  const isPlatform = role === "SUPER_ADMIN";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<ThreadPayload["conversation"]>();
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [reply, setReply] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalConversations, setTotalConversations] = useState(0);
  const [serverUnreadTotal, setServerUnreadTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const inboxRequestSequence = useRef(0);
  const threadRequestSequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const effectiveSearch = isPlatform ? debouncedSearch : search.trim();

  const loadInbox = useCallback(async (silent = false) => {
    const requestId = ++inboxRequestSequence.current;
    if (!silent) setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: "25", search: effectiveSearch, status: statusFilter });
      const payload = await requestJson<InboxPayload>(`/api/backend/platform-support?${query.toString()}`);
      if (requestId !== inboxRequestSequence.current) return;
      setConversations(Array.isArray(payload.conversations) ? payload.conversations : []);
      setTotalConversations(Number(payload.pagination?.total || 0));
      setServerUnreadTotal(Number(payload.unreadTotal || 0));
      setTotalPages(Math.max(1, Number(payload.pagination?.totalPages || 1)));
      if (typeof payload.currentUserId === "string") setCurrentUserId(payload.currentUserId);
      setError("");
    } catch (caught) {
      if (requestId === inboxRequestSequence.current) {
        setError(caught instanceof Error ? caught.message : "Unable to load support messages.");
      }
    } finally {
      if (!silent && requestId === inboxRequestSequence.current) setLoading(false);
    }
  }, [page, effectiveSearch, statusFilter]);

  const loadThread = useCallback(async (id: string, silent = false) => {
    if (!id) return;
    const requestId = ++threadRequestSequence.current;
    if (!silent) setThreadLoading(true);
    try {
      const payload = await requestJson<ThreadPayload>(`/api/backend/platform-support/${id}`);
      if (requestId !== threadRequestSequence.current) return;
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setSelected(payload.conversation);
      if (typeof payload.currentUserId === "string") setCurrentUserId(payload.currentUserId);
      if (!silent) void loadInbox(true);
    } catch (caught) {
      if (!silent && requestId === threadRequestSequence.current) {
        setError(caught instanceof Error ? caught.message : "Unable to load this support conversation.");
      }
    } finally {
      if (!silent && requestId === threadRequestSequence.current) setThreadLoading(false);
    }
  }, [loadInbox]);

  useEffect(() => { void loadInbox(); }, [loadInbox]);
  useEffect(() => {
    if (isPlatform) {
      const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadInbox(true); }, 15000);
      const visible = () => { if (document.visibilityState === "visible") void loadInbox(true); };
      document.addEventListener("visibilitychange", visible);
      return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
    }

    const intervalMs = 30_000;
    let lastRefreshAt = Date.now();
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefreshAt < intervalMs) return;
      lastRefreshAt = Date.now();
      void loadInbox(true);
    };
    const timer = window.setInterval(refreshIfStale, 5_000);
    window.addEventListener("focus", refreshIfStale);
    window.addEventListener("pageshow", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfStale);
      window.removeEventListener("pageshow", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [loadInbox, isPlatform]);
  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
    else {
      threadRequestSequence.current += 1;
      setMessages([]);
      setSelected(undefined);
    }
  }, [selectedId, loadThread]);
  useEffect(() => {
    if (!selectedId && conversations.length > 0 && !composeOpen) setSelectedId(conversations[0].id);
    if (selectedId && conversations.length > 0 && !conversations.some((item) => item.id === selectedId)) setSelectedId("");
  }, [conversations, selectedId, composeOpen]);
  useEffect(() => {
    if (!selectedId) return;
    if (isPlatform) {
      const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadThread(selectedId, true); }, 8000);
      return () => window.clearInterval(timer);
    }

    const intervalMs = 15_000;
    let lastRefreshAt = Date.now();
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefreshAt < intervalMs) return;
      lastRefreshAt = Date.now();
      void loadThread(selectedId, true);
    };
    const timer = window.setInterval(refreshIfStale, 3_000);
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [selectedId, loadThread, isPlatform]);

  const unreadTotal = serverUnreadTotal;

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true); setError(""); setNotice("");
    try {
      const result = await requestJson<{ conversationId: string }>("/api/backend/platform-support", {
        method: "POST", body: JSON.stringify({ subject, message: firstMessage }),
      });
      setSubject(""); setFirstMessage(""); setComposeOpen(false);
      await loadInbox(true);
      setSelectedId(result.conversationId);
      setNotice("Message sent to Platform Support.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start a support conversation.");
    } finally { setSending(false); }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setSending(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/backend/platform-support/${selectedId}`, { method: "POST", body: JSON.stringify({ message: reply }) });
      setReply("");
      await Promise.all([loadThread(selectedId, true), loadInbox(true)]);
      setNotice("Reply sent.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send your reply.");
    } finally { setSending(false); }
  }

  async function changeConversationStatus() {
    if (!selectedId || !selected) return;
    const nextStatus = selected.status === "CLOSED" ? "OPEN" : "CLOSED";
    setSending(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/backend/platform-support/${selectedId}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      await Promise.all([loadThread(selectedId, true), loadInbox(true)]);
      setNotice(nextStatus === "CLOSED" ? "Conversation closed." : "Conversation reopened.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the conversation.");
    } finally { setSending(false); }
  }

  return (
    <section className={`oa-platform-support-org ${isPlatform ? "sa-platform-support-inbox" : ""} overflow-hidden rounded-2xl border border-[#26364a] bg-[#0f1724] shadow-2xl shadow-black/20`}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#26364a] bg-gradient-to-r from-[#13263a] to-[#101a29] px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-sky-200">
            {isPlatform ? <Inbox size={21} /> : <CircleHelp size={21} />}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-white">{isPlatform ? "Conversations" : "Support conversations"}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-slate-600/60 bg-slate-800/70 px-3 py-1.5 text-xs text-slate-300">
            {conversations.length} {conversations.length === 1 ? "conversation" : "conversations"}{unreadTotal ? ` · ${unreadTotal} unread` : ""}
          </span>
          {!isPlatform && <button type="button" onClick={() => { setComposeOpen(true); setSelectedId(""); setError(""); setNotice(""); }} className="inline-flex items-center gap-2 rounded-lg bg-sky-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-200"><MessageCircle size={15} /> New message</button>}
        </div>
      </header>

      {error && <p role="alert" className="mx-5 mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-200 sm:mx-6">{error}</p>}
      {notice && <p role="status" className="mx-5 mt-4 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-200 sm:mx-6">{notice}</p>}

      <div className="grid min-h-[590px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="border-b border-[#26364a] lg:border-b-0 lg:border-r">
          <div className="border-b border-[#26364a] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            {isPlatform ? "Organization inbox" : "Your support history"}
          </div>
          <div className="grid gap-2 border-b border-[#26364a] p-3">
            <label className="sr-only" htmlFor="support-search">Search support conversations</label>
            <input id="support-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search organization, subject, email…" className="w-full rounded-lg border border-slate-700 bg-[#0b111b] px-3 py-2 text-xs text-white outline-none focus:border-sky-300/60" />
            <label className="sr-only" htmlFor="support-status-filter">Filter support status</label>
            <select id="support-status-filter" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as "ALL" | "OPEN" | "CLOSED"); setPage(1); }} className="w-full rounded-lg border border-slate-700 bg-[#0b111b] px-3 py-2 text-xs text-white outline-none focus:border-sky-300/60">
              <option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option>
            </select>
          </div>
          {loading ? <div className="flex items-center gap-2 p-5 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin" /> Loading conversations…</div>
            : conversations.length === 0 ? <div className="p-5 text-sm leading-6 text-slate-400">{isPlatform ? "No organization support messages yet." : "No support conversations yet. Start a message to contact the Platform Super Admin."}</div>
            : <div className="max-h-[600px] overflow-y-auto p-2">
              {conversations.map((item) => (
                <button key={item.id} type="button" onClick={() => { setComposeOpen(false); setSelectedId(item.id); setError(""); setNotice(""); }} className={`oa-support-conversation-row mb-1 w-full rounded-xl border p-3 text-left transition ${selectedId === item.id && !composeOpen ? "oa-support-conversation-selected border-sky-300/30 bg-sky-400/10" : "border-transparent hover:border-white/10 hover:bg-white/[0.035]"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {isPlatform ? (
                        <SuperAdminOrganizationLogo organizationId={item.organizationId} name={item.organizationName} size="sm" />
                      ) : (
                        <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-[10px] font-bold text-sky-100">{(item.createdByName || "U").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U"}<img src={`/api/backend/platform-support/${item.id}/photo/${item.createdByUserId}`} alt={`${item.createdByName} profile`} className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /></span>
                      )}
                      <p className="line-clamp-1 min-w-0 text-sm font-semibold text-slate-100">{isPlatform ? item.organizationName : item.subject}</p>
                    </div>
                    {item.unreadCount > 0 && <span className="min-w-5 rounded-full bg-sky-300 px-1.5 py-0.5 text-center text-[10px] font-bold text-slate-950">{item.unreadCount}</span>}
                  </div>
                  {isPlatform && <p className="mt-1 text-xs text-slate-400">{item.subject} · {item.createdByName}</p>}
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{item.lastMessage || "No messages yet"}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500"><span>{formatDate(item.lastMessageAt)}</span><span className={item.status === "OPEN" ? "text-emerald-300" : "text-slate-500"}>{item.status}</span></div>
                </button>
              ))}
            </div>}
          {!loading && totalConversations > 0 && <div className="flex items-center justify-between border-t border-[#26364a] px-3 py-3 text-[11px] text-slate-400"><span>Page {page} of {totalPages}</span><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="rounded-md border border-slate-700 px-2 py-1 disabled:opacity-40">Prev</button><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="rounded-md border border-slate-700 px-2 py-1 disabled:opacity-40">Next</button></div></div>}
        </aside>

        <div className="flex min-h-[590px] min-w-0 flex-col">
          {composeOpen && !isPlatform ? (
            <form onSubmit={(event) => void startConversation(event)} className="flex flex-1 flex-col gap-4 p-5 sm:p-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">New support request</p>
                <h2 className="mt-2 text-xl font-semibold text-white">How can the platform team help?</h2>
              </div>
              <label className="grid gap-2 text-sm text-slate-300">Subject
                <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} required className="rounded-xl border border-slate-700 bg-[#0b111b] px-3 py-3 text-sm text-white outline-none focus:border-sky-300/60" placeholder="e.g. Help with organization setup" />
              </label>
              <label className="grid flex-1 content-start gap-2 text-sm text-slate-300">Message
                <textarea value={firstMessage} onChange={(event) => setFirstMessage(event.target.value)} onKeyDown={(event) => submitOnEnter(event, sending)} maxLength={4000} required rows={7} className="min-h-[180px] rounded-xl border border-slate-700 bg-[#0b111b] px-3 py-3 text-sm leading-6 text-white outline-none focus:border-sky-300/60" placeholder="Describe what you need help with…" /><p className="-mt-1 text-xs text-slate-500">Press Enter to send · Shift+Enter for a new line.</p>
              </label>
              <div><button disabled={sending} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-sky-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{sending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />} Send to Platform Super Admin</button></div>
            </form>
          ) : selectedId ? (
            <>
              <header className="flex items-center gap-3 border-b border-[#26364a] px-5 py-4 sm:px-7">
                {isPlatform && selected?.organizationId ? (
                  <SuperAdminOrganizationLogo organizationId={selected.organizationId} name={selected.organizationName} size="md" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-300/20 bg-sky-400/10 text-sky-200">{isPlatform ? <Building2 size={18} /> : <ShieldCheck size={18} />}</span>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-white">{isPlatform ? selected?.organizationName || conversations.find((item) => item.id === selectedId)?.organizationName || "Organization" : "Platform Super Admin"}</h2>
                  <p className="mt-1 text-xs text-slate-400">{selected?.subject || conversations.find((item) => item.id === selectedId)?.subject || "Support conversation"} · {selected?.status || "OPEN"}</p>
                </div>
                <button type="button" onClick={() => void changeConversationStatus()} disabled={sending || !selected} className="ml-auto shrink-0 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-40">{selected?.status === "CLOSED" ? "Reopen" : "Close"}</button>
              </header>
              <div className="flex-1 space-y-4 overflow-y-auto bg-[#0b111b]/70 p-5 sm:p-7">
                {threadLoading && messages.length === 0 ? <p className="text-sm text-slate-400">Loading conversation…</p>
                  : messages.length === 0 ? <p className="text-sm text-slate-400">No messages in this conversation yet.</p>
                  : messages.map((item) => {
                    const mine = item.senderUserId === currentUserId;
                    return <div key={item.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-[10px] font-bold text-sky-100 ${mine ? "order-2" : "order-1"}`}>
                        {(item.senderName || "U").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U"}
                        <img
                          src={`/api/backend/platform-support/${selectedId}/photo/${item.senderUserId}`}
                          alt={`${item.senderName} profile`}
                          className="absolute inset-0 h-full w-full bg-slate-900 object-cover"
                          onError={(event) => { event.currentTarget.style.display = "none"; }}
                        />
                      </div>
                      <div className={`oa-support-message-bubble max-w-[88%] rounded-2xl border px-4 py-3 sm:max-w-[75%] ${mine ? "oa-support-message-sent order-1 border-sky-300/20 bg-sky-400/10" : "oa-support-message-received order-2 border-slate-700/70 bg-[#131d2b]"}`}>
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400"><span className="font-semibold text-slate-200">{mine ? "You" : item.senderName}</span><span>{displayRole(item.senderRole)}</span><span>·</span><span>{formatDate(item.createdAt)}</span></div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{item.body}</p>{mine && <div className="mt-2 flex justify-end" title={item.readAt ? "Read" : item.deliveredAt ? "Delivered" : "Sent"} aria-label={item.readAt ? "Read" : item.deliveredAt ? "Delivered" : "Sent"}>{item.readAt ? <CheckCheck size={15} className="text-sky-300" /> : item.deliveredAt ? <CheckCheck size={15} className="text-slate-400" /> : <Check size={15} className="text-slate-500" />}</div>}
                      </div>
                    </div>;
                  })}
              </div>
              {selected?.status === "CLOSED" ? <div className="border-t border-[#26364a] p-4 text-sm text-slate-400">This conversation is closed.</div>
                : <form onSubmit={(event) => void sendReply(event)} className="flex items-end gap-3 border-t border-[#26364a] p-4 sm:p-5">
                  <textarea value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => submitOnEnter(event, sending)} maxLength={4000} required rows={2} className="min-h-[48px] flex-1 resize-y rounded-xl border border-slate-700 bg-[#0b111b] px-3 py-3 text-sm text-white outline-none focus:border-sky-300/60" placeholder="Write a reply…" />
                  <div className="flex flex-col items-end gap-1"><span className="text-[10px] text-slate-500">Enter to send · Shift+Enter for a new line</span><button type="submit" disabled={sending || !reply.trim()} aria-label="Send reply" className="inline-flex h-12 items-center gap-2 rounded-xl bg-sky-300 px-4 text-sm font-bold text-slate-950 disabled:opacity-50">{sending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />} <span className="hidden sm:inline">Send</span></button></div>
                </form>}
            </>
          ) : <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/70 text-slate-300">{isPlatform ? <Inbox size={24} /> : <MessageCircle size={24} />}</span><h2 className="mt-4 text-base font-semibold text-white">{isPlatform ? "Select an organization conversation" : "Your platform support channel"}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{isPlatform ? "Choose a message from the inbox to review and reply." : "Start a support conversation to get in touch with the Platform Super Admin."}</p></div>}
        </div>
      </div>
    </section>
  );
}
