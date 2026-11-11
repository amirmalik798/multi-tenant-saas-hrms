"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Bell, CheckCheck, Check, LoaderCircle, MessageCircle, Plus, RefreshCw, Send } from "lucide-react";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";

type Conversation = {
  id: string;
  subject: string;
  createdAt: string;
  lastMessageAt: string;
  otherUserId: string;
  otherEmployeeId: string | null;
  otherName: string;
  otherRole: string;
  lastMessage: string;
  unreadCount: number;
};
type Message = {
  id: string;
  senderUserId: string;
  senderName: string;
  senderEmployeeId: string | null;
  senderRole: string;
  body: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
};
type InboxPayload = {
  message?: string;
  currentUserId?: string;
  conversations?: Conversation[];
  canStartNew?: boolean;
  recipientName?: string | null;
  recipientRole?: string | null;
};
type ThreadPayload = {
  message?: string;
  currentUserId?: string;
  conversation?: { id: string; subject: string; otherUserId: string; otherName: string; otherEmployeeId: string | null; otherRole: string };
  messages?: Message[];
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
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

function displayRole(role: string) {
  return role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatDate(value: string, timeZone?: string | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !timeZone) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }).format(date);
  } catch {
    // Do not display a device-local timestamp for an organization message.
    return value;
  }
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, sending: boolean) {
  // Enter sends; Shift+Enter inserts a newline. Ignore IME composition so
  // East Asian input methods can confirm text without sending the message.
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  if (!sending) event.currentTarget.form?.requestSubmit();
}

export default function CommunicationWorkspace({ roleLabel }: { roleLabel: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadSubject, setThreadSubject] = useState("");
  const [otherName, setOtherName] = useState("");
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [otherEmployeeId, setOtherEmployeeId] = useState<string | null>(null);
  const [canStartNew, setCanStartNew] = useState(false);
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [reply, setReply] = useState("");

  const loadInbox = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const payload = await requestJson<InboxPayload>("/api/backend/communications");
      setConversations(Array.isArray(payload.conversations) ? payload.conversations : []);
      if (typeof payload.currentUserId === "string") setCurrentUserId(payload.currentUserId);
      setCanStartNew(Boolean(payload.canStartNew));
      setRecipientName(payload.recipientName ?? null);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load messages.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (id: string, silent = false) => {
    if (!id) return;
    if (!silent) setThreadLoading(true);
    try {
      const payload = await requestJson<ThreadPayload>(`/api/backend/communications/${id}`);
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      if (typeof payload.currentUserId === "string") setCurrentUserId(payload.currentUserId);
      setThreadSubject(payload.conversation?.subject ?? "");
      setOtherName(payload.conversation?.otherName ?? "");
      setOtherUserId(payload.conversation?.otherUserId ?? null);
      setOtherEmployeeId(payload.conversation?.otherEmployeeId ?? null);
      if (!silent) void loadInbox(true);
    } catch (caught) {
      if (!silent) setError(caught instanceof Error ? caught.message : "Unable to load this conversation.");
    } finally {
      if (!silent) setThreadLoading(false);
    }
  }, [loadInbox]);

  useEffect(() => { void loadInbox(); }, [loadInbox]);
  useEffect(() => {
    let active = true;
    void requestJson<{ timeZone?: string }>("/api/backend/workspace/context")
      .then((context) => {
        if (active && typeof context.timeZone === "string" && context.timeZone.trim()) {
          setTimeZone(context.timeZone);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (roleLabel !== "Organization Admin") {
      const timer = window.setInterval(() => { void loadInbox(true); }, 5000);
      const visible = () => { if (document.visibilityState === "visible") void loadInbox(true); };
      document.addEventListener("visibilitychange", visible);
      return () => {
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", visible);
      };
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
  }, [loadInbox, roleLabel]);
  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
    else {
      setMessages([]);
      setThreadSubject("");
      setOtherName("");
      setOtherUserId(null);
      setOtherEmployeeId(null);
    }
  }, [selectedId, loadThread]);
  useEffect(() => {
    if (!selectedId && conversations.length > 0 && !composeOpen) setSelectedId(conversations[0].id);
    if (selectedId && conversations.length > 0 && !conversations.some((item) => item.id === selectedId)) setSelectedId("");
  }, [conversations, selectedId, composeOpen]);
  useEffect(() => {
    if (!selectedId) return;
    if (roleLabel !== "Organization Admin") {
      const timer = window.setInterval(() => { void loadThread(selectedId, true); }, 4000);
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
  }, [selectedId, loadThread, roleLabel]);

  const unreadTotal = useMemo(() => conversations.reduce((sum, item) => sum + item.unreadCount, 0), [conversations]);

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true); setError(""); setNotice("");
    try {
      const result = await requestJson<{ conversationId: string }>("/api/backend/communications", {
        method: "POST",
        body: JSON.stringify({ subject, message: newMessage }),
      });
      setSubject(""); setNewMessage(""); setComposeOpen(false);
      setSelectedId(result.conversationId);
      setNotice("Message sent.");
      await loadInbox(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send your message.");
    } finally { setSending(false); }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setSending(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/backend/communications/${selectedId}`, {
        method: "POST",
        body: JSON.stringify({ message: reply }),
      });
      setReply("");
      await Promise.all([loadThread(selectedId, true), loadInbox(true)]);
      setNotice("Reply sent.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send your reply.");
    } finally { setSending(false); }
  }

  function chooseConversation(id: string) {
    setComposeOpen(false);
    setSelectedId(id);
    setError(""); setNotice("");
  }

  return (
    <div className="hr-manager-communications-workspace oa-org-admin-communications space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-[#131a24] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sky-300"><MessageCircle size={18} /><span className="text-xs font-bold uppercase tracking-[0.16em]">{roleLabel}</span></div>
            <h2 className="mt-2 text-xl font-bold text-white">Messages</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">Private in-app conversations with your reporting line. New messages and replies refresh automatically while this page is open.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300"><Bell size={14} /> {unreadTotal} unread</span>
            <button type="button" onClick={() => void loadInbox()} disabled={loading} className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-50" aria-label="Refresh messages"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
            {canStartNew && <button type="button" onClick={() => { setComposeOpen(true); setSelectedId(""); setError(""); setNotice(""); }} className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-3.5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-300"><Plus size={16} /> New message</button>}
          </div>
        </div>
        {canStartNew && <p className="mt-3 text-xs text-slate-500">New conversations go to {recipientName || "your assigned higher-up"}. Replies stay in the same private thread.</p>}
        {!canStartNew && roleLabel !== "Organization Admin" && <p className="mt-3 text-xs text-amber-200">New messages are temporarily unavailable because no active higher-up account was found. Ask your organization administrator to check the reporting hierarchy.</p>}
        {!canStartNew && roleLabel === "Organization Admin" && <p className="mt-3 text-xs text-slate-500">Reply to messages from your HR Manager here. Organization Admin is the top role in the tenant reporting chain.</p>}
        {!canStartNew && conversations.length === 0 && <p className="mt-3 text-xs text-slate-500">No conversations yet.</p>}
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>}

      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-2xl border border-slate-800 bg-[#131a24]">
          <div className="border-b border-slate-800 px-4 py-3"><h3 className="text-sm font-semibold text-slate-100">Inbox</h3><p className="mt-0.5 text-xs text-slate-500">{conversations.length} conversation{conversations.length === 1 ? "" : "s"}</p></div>
          {loading && conversations.length === 0 ? <div className="flex items-center gap-2 p-4 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin" /> Loading inbox…</div> : conversations.length === 0 ? <div className="p-5 text-sm leading-6 text-slate-400">No messages yet.</div> : <div className="max-h-[620px] overflow-y-auto divide-y divide-slate-800/80">{conversations.map((item) => <button key={item.id} type="button" onClick={() => chooseConversation(item.id)} className={`oa-conversation-row w-full px-4 py-4 text-left transition hover:bg-white/[0.03] ${selectedId === item.id ? "oa-conversation-row-selected bg-sky-500/[0.08] ring-1 ring-inset ring-sky-500/20" : ""}`}><span className="flex items-start justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><EmployeeProfilePhoto employeeId={item.otherEmployeeId} conversationId={item.id} photoUrl={`/api/backend/communications/${item.id}/user-photo/${item.otherUserId}`} name={item.otherName} className="size-9 rounded-xl border border-slate-700 bg-slate-900 text-[10px]" textClassName="text-[10px] font-bold text-slate-200" /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-100">{item.subject}</span><span className="mt-1 block truncate text-xs text-slate-400">{item.otherName} · {displayRole(item.otherRole)}</span></span></span>{item.unreadCount > 0 && <span className="rounded-full bg-sky-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">{item.unreadCount}</span>}</span><span className="mt-2 block truncate text-xs text-slate-500">{item.lastMessage}</span><span className="mt-2 block text-[10px] text-slate-600">{formatDate(item.lastMessageAt, timeZone)}</span></button>)}</div>}
        </aside>

        <section className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#131a24]">
          {composeOpen ? <form onSubmit={startConversation} className="flex h-full flex-col">
            <div className="border-b border-slate-800 px-5 py-4"><h3 className="text-base font-semibold text-white">New message</h3><p className="mt-1 text-sm text-slate-400">To: {recipientName || "Your higher-up"}</p></div>
            <div className="flex-1 space-y-4 p-5">
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-300">Subject</span><input required minLength={3} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#0d131d] px-3.5 py-3 text-sm text-white outline-none focus:border-sky-400" placeholder="What do you need help with?" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-300">Message</span><textarea required maxLength={4000} rows={8} value={newMessage} onChange={(event) => setNewMessage(event.target.value)} onKeyDown={(event) => submitOnEnter(event, sending)} className="w-full resize-y rounded-xl border border-slate-700 bg-[#0d131d] px-3.5 py-3 text-sm leading-6 text-white outline-none focus:border-sky-400" placeholder="Write your message…" /></label><p className="-mt-3 text-xs text-slate-500">Press Enter to send · Shift+Enter for a new line.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-800 p-4"><button type="button" onClick={() => { setComposeOpen(false); setSubject(""); setNewMessage(""); }} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.04]">Cancel</button><button disabled={sending} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-50"><Send size={15} /> {sending ? "Sending…" : "Send message"}</button></div>
          </form> : selectedId ? <>
            <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4"><EmployeeProfilePhoto employeeId={otherEmployeeId} conversationId={selectedId} photoUrl={otherUserId ? `/api/backend/communications/${selectedId}/user-photo/${otherUserId}` : null} name={otherName || "Colleague"} className="size-10 rounded-xl border border-slate-700 bg-slate-900 text-xs" textClassName="text-xs font-bold text-slate-200" /><div className="min-w-0"><h3 className="truncate text-base font-semibold text-white">{threadSubject || "Conversation"}</h3><p className="mt-1 truncate text-xs text-slate-400">With {otherName || "colleague"} · updates every few seconds</p></div></div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" aria-live="polite">
              {threadLoading && messages.length === 0 ? <div className="flex items-center gap-2 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin" /> Loading conversation…</div> : messages.map((item) => {
                const own = item.senderUserId === currentUserId;
                return <div key={item.id} className={`flex max-w-full items-end gap-2 ${own ? "mr-auto" : "ml-auto"}`}>
                  {own && <EmployeeProfilePhoto employeeId={item.senderEmployeeId} conversationId={selectedId} photoUrl={`/api/backend/communications/${selectedId}/user-photo/${item.senderUserId}`} name={item.senderName} className="size-9 rounded-xl border border-slate-700 bg-slate-900 text-xs" textClassName="text-xs font-bold text-slate-200" />}
                  <article className={`oa-message-bubble min-w-0 max-w-[calc(100%-2.75rem)] rounded-2xl border px-4 py-3 ${own ? "oa-message-sent border-slate-700 bg-[#0d131d]" : "oa-message-received border-sky-500/20 bg-sky-500/[0.08]"}`}><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-100">{item.senderName}</span><span className="text-[10px] text-slate-500">{displayRole(item.senderRole)}</span><span className="text-[10px] text-slate-600">{formatDate(item.createdAt, timeZone)}</span></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{item.body}</p>{own && <div className="mt-2 flex justify-end" title={item.readAt ? "Read" : item.deliveredAt ? "Delivered" : "Sent"} aria-label={item.readAt ? "Read" : item.deliveredAt ? "Delivered" : "Sent"}>{item.readAt ? <CheckCheck size={15} className="text-sky-300" /> : item.deliveredAt ? <CheckCheck size={15} className="text-slate-400" /> : <Check size={15} className="text-slate-500" />}</div>}</article>
                  {!own && <EmployeeProfilePhoto employeeId={item.senderEmployeeId} conversationId={selectedId} photoUrl={`/api/backend/communications/${selectedId}/user-photo/${item.senderUserId}`} name={item.senderName} className="size-9 rounded-xl border border-sky-300/20 bg-slate-900 text-xs" textClassName="text-xs font-bold text-sky-100" />}
                </div>;
              })}
              {messages.length === 0 && !threadLoading && <p className="text-sm text-slate-400">No messages in this conversation yet.</p>}
            </div>
            <form onSubmit={sendReply} className="border-t border-slate-800 p-3 sm:p-4"><label className="sr-only" htmlFor="communication-reply">Reply</label><div className="flex items-end gap-2"><textarea id="communication-reply" required maxLength={4000} rows={2} value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => submitOnEnter(event, sending)} className="min-h-12 flex-1 resize-y rounded-xl border border-slate-700 bg-[#0d131d] px-3.5 py-3 text-sm text-white outline-none focus:border-sky-400" placeholder="Write a reply…" /><button disabled={sending} type="submit" aria-label="Send reply" className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-sky-400 text-slate-950 hover:bg-sky-300 disabled:opacity-50"><Send size={17} /></button></div><p className="mt-2 text-[10px] text-slate-600">Enter to send · Shift+Enter for a new line. Only conversation participants can read or reply.</p></form>
          </> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><span className="flex size-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-400"><MessageCircle size={24} /></span><h3 className="mt-4 text-base font-semibold text-white">Choose a conversation</h3><p className="mt-1 max-w-sm text-sm leading-6 text-slate-400">Select a message from your inbox{canStartNew ? ", or start a new conversation with your higher-up" : ""}.</p></div>}
        </section>
      </div>
      <p className="text-xs text-slate-600">Messages are stored in your organization’s HRMS. Do not include passwords or highly sensitive personal information.</p>
    </div>
  );
}
