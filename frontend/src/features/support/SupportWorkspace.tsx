"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CircleHelp, Inbox, MessageCircle, Send } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest } from "@/lib/api-client";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { formatDate } from "@/lib/format";

interface Conversation {
  id: string; organizationId: string; organizationName: string; subject: string; status: "OPEN" | "CLOSED";
  createdAt: string; updatedAt: string; lastMessageAt: string; createdByUserId: string; createdByName: string; lastMessage: string; unreadCount: number;
}
interface Message { id: string; senderUserId: string; senderName: string; senderRole: string; body: string; createdAt: string; deliveredAt: string | null; readAt: string | null }
interface InboxResult { currentUserId?: string; conversations?: Conversation[]; unreadTotal?: number; pagination?: { page?: number; total?: number; totalPages?: number } }
interface ThreadResult { currentUserId?: string; conversation?: Pick<Conversation, "id" | "organizationId" | "organizationName" | "subject" | "status">; messages?: Message[] }

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, busy: boolean) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  if (!busy) event.currentTarget.form?.requestSubmit();
}

export function SupportWorkspace() {
  const { timeZone } = useWorkspace();
  const [items, setItems] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<ThreadResult["conversation"]>();
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [compose, setCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const inboxSequence = useRef(0);
  const threadSequence = useRef(0);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);

  const loadInbox = useCallback(async (silent = false) => {
    const sequence = ++inboxSequence.current;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25", search: debouncedSearch, status });
      const result = await apiRequest<InboxResult>(`/platform-support?${params.toString()}`);
      if (sequence !== inboxSequence.current) return;
      setItems(Array.isArray(result.conversations) ? result.conversations : []);
      setCurrentUserId(result.currentUserId || "");
      setUnreadTotal(Number(result.unreadTotal || 0));
      setTotalPages(Math.max(1, Number(result.pagination?.totalPages || 1)));
      setError("");
    } catch (caught) { if (sequence === inboxSequence.current) setError(caught instanceof Error ? caught.message : "Unable to load your support history."); }
    finally { if (!silent && sequence === inboxSequence.current) setLoading(false); }
  }, [page, debouncedSearch, status]);

  const loadThread = useCallback(async (id: string, silent = false) => {
    if (!id) return;
    const sequence = ++threadSequence.current;
    if (!silent) setThreadLoading(true);
    try {
      const result = await apiRequest<ThreadResult>(`/platform-support/${id}`);
      if (sequence !== threadSequence.current) return;
      setMessages(Array.isArray(result.messages) ? result.messages : []);
      setSelected(result.conversation);
      setCurrentUserId(result.currentUserId || "");
      if (!silent) void loadInbox(true);
    } catch (caught) { if (!silent && sequence === threadSequence.current) setError(caught instanceof Error ? caught.message : "Unable to load this conversation."); }
    finally { if (!silent && sequence === threadSequence.current) setThreadLoading(false); }
  }, [loadInbox]);

  useEffect(() => { void loadInbox(); }, [loadInbox]);
  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
    else { threadSequence.current += 1; setMessages([]); setSelected(undefined); }
  }, [selectedId, loadThread]);
  useEffect(() => {
    if (!selectedId && items.length && !compose) setSelectedId(items[0].id);
    if (selectedId && items.length && !items.some((item) => item.id === selectedId)) setSelectedId("");
  }, [items, selectedId, compose]);
  useSmartRefresh(async () => {
    await loadInbox(true);
    if (selectedId) await loadThread(selectedId, true);
  }, !compose && !busy);

  const visibleItems = useMemo(() => items, [items]);

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ conversationId: string }>("/platform-support", { method: "POST", body: JSON.stringify({ subject: subject.trim(), message: firstMessage.trim() }) });
      setSubject(""); setFirstMessage(""); setCompose(false); setSelectedId(result.conversationId); setNotice("Your support message was sent to the platform team."); await loadInbox(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to send your support message."); }
    finally { setBusy(false); }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedId || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`/platform-support/${selectedId}`, { method: "POST", body: JSON.stringify({ message: reply.trim() }) });
      setReply(""); await Promise.all([loadThread(selectedId, true), loadInbox(true)]); setNotice("Your reply was sent.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to send your reply."); }
    finally { setBusy(false); }
  }

  async function changeStatus() {
    if (!selected || busy) return;
    const nextStatus = selected.status === "CLOSED" ? "OPEN" : "CLOSED";
    setBusy(true); setError("");
    try {
      await apiRequest(`/platform-support/${selected.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      await Promise.all([loadThread(selected.id, true), loadInbox(true)]);
      setNotice(nextStatus === "CLOSED" ? "Support conversation closed." : "Support conversation reopened.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update this conversation."); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="Communication" title="Platform support" description="Contact the platform team and follow the history of your support conversations." />
    {notice ? <div className="success-callout" role="status" style={{ marginBottom: 12 }}>{notice}</div> : null}
    {error ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error} The inbox will retry automatically.</div> : null}
    <Panel className="support-panel">
      <div className="support-heading"><div><span className="support-icon"><CircleHelp size={18} /></span><div><h2>Support conversations</h2><p>{unreadTotal} unread message{unreadTotal === 1 ? "" : "s"}</p></div></div><Button variant="primary" leading={<MessageCircle size={14} />} onClick={() => { setCompose(true); setSelectedId(""); setError(""); }}>New support request</Button></div>
      <div className="support-layout">
        <aside className="support-inbox">
          <div className="support-filters"><label className="search-field"><span className="sr-only">Search support conversations</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search your conversations…" /></label><select className="filter-select" aria-label="Filter support status" value={status} onChange={(event) => { const nextStatus = event.target.value; if (nextStatus === "ALL" || nextStatus === "OPEN" || nextStatus === "CLOSED") setStatus(nextStatus); setPage(1); }}><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select></div>
          <div className="support-thread-list">{loading && !visibleItems.length ? <div className="loading-state">Loading conversations…</div> : visibleItems.length ? visibleItems.map((item) => <button type="button" key={item.id} onClick={() => { setCompose(false); setSelectedId(item.id); setError(""); setNotice(""); }} className={`support-thread-row ${selectedId === item.id && !compose ? "support-thread-active" : ""}`}><span className="support-thread-top"><strong>{item.subject}</strong><StatusBadge value={item.status} /></span><span className="support-thread-meta">{item.createdByName} · {dateLabel(item.lastMessageAt, timeZone)}</span><span className="support-thread-preview">{item.lastMessage || "No messages yet"}</span></button>) : <div className="empty-state"><div className="state-icon"><Inbox size={18} /></div><h3>{search || status !== "ALL" ? "No matching conversations" : "No support conversations"}</h3><p>Start a request when you need help with your organization account or workspace.</p></div>}</div>
          {totalPages > 1 ? <div className="table-footer"><span>Page {page} of {totalPages}</span><div><Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div> : null}
        </aside>
        <section className="support-conversation">
          {compose ? <form className="support-compose" onSubmit={startConversation}><div><p className="eyebrow">NEW SUPPORT REQUEST</p><h2>How can the platform team help?</h2><p>Start a private support conversation with the platform administrator.</p></div><Field label="Subject"><TextInput required minLength={1} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Briefly describe the issue" /></Field><Field label="Message"><TextArea required maxLength={4000} rows={8} value={firstMessage} onChange={(event) => setFirstMessage(event.target.value)} onKeyDown={(event) => submitOnEnter(event, busy)} placeholder="Describe what you need help with… Press Enter to send, Shift+Enter for a new line." /></Field><div className="support-compose-actions"><Button variant="secondary" type="button" onClick={() => setCompose(false)}>Cancel</Button><Button variant="primary" type="submit" busy={busy} leading={<Send size={14} />}>Send request</Button></div></form> : selected && selectedId ? <><div className="support-thread-header"><div><p className="eyebrow">SUPPORT THREAD</p><h2>{selected.subject}</h2><p>Platform support team · {selected.organizationName}</p></div><div><StatusBadge value={selected.status} /><Button size="sm" variant="secondary" disabled={busy} onClick={() => void changeStatus()}>{selected.status === "OPEN" ? "Close conversation" : "Reopen conversation"}</Button></div></div><div className="support-message-list">{threadLoading && !messages.length ? <div className="loading-state">Loading conversation…</div> : messages.map((message) => <article className={`support-message ${message.senderUserId === currentUserId ? "support-message-own" : ""}`} key={message.id}><div className="support-message-meta"><strong>{message.senderUserId === currentUserId ? "You" : message.senderName}</strong><span>{dateLabel(message.createdAt, timeZone)}</span></div><p>{message.body}</p>{message.senderUserId === currentUserId && message.readAt ? <small>Read {dateLabel(message.readAt, timeZone)}</small> : null}</article>)}</div>{selected.status === "OPEN" ? <form className="support-reply" onSubmit={sendReply}><TextArea required maxLength={4000} rows={2} value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => submitOnEnter(event, busy)} placeholder="Write a reply…" /><Button type="submit" variant="primary" busy={busy} leading={<Send size={14} />}>Send</Button></form> : <div className="form-note">This conversation is closed. Reopen it to send a new reply.</div>}</> : <div className="support-empty"><span className="state-icon"><MessageCircle size={20} /></span><h2>Your support inbox</h2><p>Choose a conversation to see its messages, or start a new request.</p></div>}
        </section>
      </div>
    </Panel>
    <style jsx>{`
      .support-panel { overflow:hidden; }
      .support-heading { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:16px 18px; border-bottom:1px solid var(--border); }
      .support-heading > div { display:flex; align-items:center; gap:12px; min-width:0; }
      .support-heading h2 { margin:0; color:var(--text-strong); font-size:14px; }
      .support-heading p { margin:3px 0 0; color:var(--muted); font-size:11px; }
      .support-icon { width:36px; height:36px; display:grid; place-items:center; flex:0 0 auto; border:1px solid var(--border); border-radius:10px; color:var(--accent); background:var(--surface-muted); }
      .support-layout { height:min(680px,max(390px,calc(100dvh - 310px))); min-height:390px; display:grid; grid-template-columns:minmax(240px,320px) minmax(0,1fr); overflow:hidden; }
      .support-inbox { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; border-right:1px solid var(--border); }
      .support-filters { display:flex; gap:8px; padding:12px; flex:0 0 auto; border-bottom:1px solid var(--border); }
      .support-filters .search-field { min-width:0; flex:1; }
      .support-filters .filter-select { min-width:95px; max-width:115px; }
      .support-thread-list { min-height:0; flex:1 1 auto; overflow-y:auto; overscroll-behavior:contain; }
      .support-thread-row { width:100%; display:grid; gap:6px; padding:13px 14px; border:0; border-bottom:1px solid var(--border); background:transparent; text-align:left; }
      .support-thread-row:hover,.support-thread-active { background:var(--surface-muted); }
      .support-thread-top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .support-thread-top strong { min-width:0; overflow:hidden; text-overflow:ellipsis; color:var(--text-strong); font-size:12px; }
      .support-thread-meta,.support-thread-preview { display:block; color:var(--muted); font-size:10px; line-height:1.45; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .support-conversation { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; }
      .support-thread-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 17px; border-bottom:1px solid var(--border); flex:0 0 auto; }
      .support-thread-header h2 { margin:0; font-size:14px; color:var(--text-strong); }
      .support-thread-header p:not(.eyebrow) { margin:4px 0 0; color:var(--muted); font-size:10px; }
      .support-thread-header > div:last-child { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .support-message-list { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter:stable; display:flex; flex-direction:column; align-items:stretch; gap:12px; padding:16px; }
      .support-message { max-width:min(82%,620px); align-self:flex-start; padding:11px 13px; border:1px solid var(--border); border-radius:12px 12px 12px 3px; background:var(--surface-muted); }
      .support-message-own { align-self:flex-end; background:var(--accent-soft); border-color:color-mix(in srgb,var(--accent) 20%,var(--border)); border-radius:12px 12px 3px 12px; }
      .support-message-meta { display:flex; justify-content:space-between; gap:12px; color:var(--muted); font-size:10px; }
      .support-message p { margin:8px 0 0; color:var(--text); font-size:12px; line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }
      .support-message small { display:block; margin-top:7px; color:var(--muted); font-size:9px; }
      .support-reply { display:flex; align-items:flex-end; gap:10px; flex:0 0 auto; padding:12px 14px; border-top:1px solid var(--border); }
      .support-reply > *:first-child { flex:1; min-width:0; }
      .support-reply textarea { min-height:42px; max-height:120px; resize:vertical; overflow-y:auto; }
      .support-compose { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; display:grid; align-content:start; gap:14px; padding:20px; }
      .support-compose h2 { margin:0; font-size:17px; color:var(--text-strong); }
      .support-compose p:not(.eyebrow) { margin:5px 0 0; color:var(--muted); font-size:11px; }
      .support-compose-actions { display:flex; justify-content:flex-end; gap:8px; }
      .support-empty { flex:1; min-height:0; display:grid; place-content:center; justify-items:center; text-align:center; padding:24px; }
      .support-empty h2 { color:var(--text-strong); font-size:16px; }
      .support-empty p { color:var(--muted); font-size:11px; }
      @media(max-width:760px) {
        .support-layout { height:min(720px,max(460px,calc(100dvh - 240px))); min-height:460px; grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(135px,180px) minmax(0,1fr); }
        .support-inbox { border-right:0; border-bottom:1px solid var(--border); }
        .support-filters { padding:8px; }
        .support-thread-header { padding:10px 12px; align-items:flex-start; }
        .support-message-list { padding:12px; }
        .support-message { max-width:94%; }
        .support-reply { padding:10px; }
        .support-compose { padding:14px; }
      }
    `}</style>
  </>;
}
function dateLabel(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try { return new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date); }
  catch { return new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(date); }
}
