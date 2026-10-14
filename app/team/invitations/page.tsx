"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Clock3, FolderKanban, Inbox, Mail, ShieldCheck, X } from "lucide-react";

type Invitation = {
  id: number;
  workspaceName: string;
  inviterName: string;
  role: string;
  status: string;
  created_at?: string;
  projectNames?: string[];
};

type Message = { id: number; type: string; title: string; body: string; createdAt: string };

const statusLabels: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
};

function formatDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function InvitationsPage() {
  const [items, setItems] = useState<Invitation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/invitations");
    if (!response.ok) throw new Error("Messages could not be loaded. Make sure you are signed in.");
    const data = await response.json();
    setItems(data.invitations ?? []);
    setMessages(data.messages ?? []);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/invitations", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Messages could not be loaded. Make sure you are signed in.");
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(data.invitations ?? []);
          setMessages(data.messages ?? []);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function respond(id: number, action: string) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/invitations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to respond to the invitation.");
      await load();
      if (action === "accept") window.dispatchEvent(new Event("workspace-membership-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to respond to the invitation.");
    } finally {
      setBusy(null);
    }
  }

  const pendingCount = items.filter((item) => item.status === "pending").length;
  const totalCount = messages.length + items.length;

  return (
    <main className="messages-page mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="messages-header">
        <div className="messages-header-icon" aria-hidden="true"><Inbox size={23} strokeWidth={1.8} /></div>
        <div className="min-w-0">
          <p className="messages-eyebrow">INBOX</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Messages</h1>
          <p className="messages-muted mt-2 max-w-2xl text-sm leading-6 sm:text-[15px]">Account updates and workspace invitations in one place.</p>
        </div>
      </header>

      <div className="messages-summary mt-7 grid grid-cols-2 gap-3 sm:flex">
        <div className="messages-summary-item"><Mail size={16} aria-hidden="true" /><span><strong>{totalCount}</strong> total</span></div>
        <div className="messages-summary-item"><Clock3 size={16} aria-hidden="true" /><span><strong>{pendingCount}</strong> pending</span></div>
      </div>

      {error ? <p role="alert" className="messages-error mt-5 rounded-xl p-4 text-sm">{error}</p> : null}

      {loading ? (
        <div className="messages-empty mt-6"><div className="messages-loading-dot" /><p>Loading messages...</p></div>
      ) : !totalCount ? (
        <div className="messages-empty mt-6">
          <div className="messages-empty-icon"><Bell size={24} strokeWidth={1.7} /></div>
          <h2 className="mt-4 font-semibold">Your inbox is clear</h2>
          <p className="messages-muted mt-1 text-sm">Account updates and invitations will appear here.</p>
        </div>
      ) : (
        <section className="mt-6 space-y-3" aria-label="Message list">
          {items.map((item) => (
            <article id={`invitation-${item.id}`} key={`invitation-${item.id}`} className="messages-card messages-invitation-card scroll-mt-6 target:border-emerald-400/60">
              <div className={`messages-card-icon ${item.projectNames?.length ? "messages-project-icon" : "messages-invitation-icon"}`} aria-hidden="true">{item.projectNames?.length ? <FolderKanban size={19} strokeWidth={1.8} /> : <Mail size={19} strokeWidth={1.8} />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0"><p className="messages-card-kicker">{item.projectNames?.length ? "PROJECT INVITATION" : "WORKSPACE INVITATION"}</p><h2 className="mt-1 truncate text-[17px] font-semibold">{item.projectNames?.length ? item.projectNames.join(", ") : item.workspaceName}</h2></div>
                  <span className={`messages-status messages-status-${item.status}`}>{statusLabels[item.status] ?? item.status}</span>
                </div>
                <p className="messages-muted mt-2 text-sm leading-6"><strong className="messages-strong">{item.inviterName}</strong> invited you {item.projectNames?.length ? <>to a project in <strong className="messages-strong">{item.workspaceName}</strong></> : "to this workspace"} as {displayRole(item.role)}.</p>
                {item.created_at ? <p className="messages-faint mt-2 text-xs">{formatDate(item.created_at)}</p> : null}
                {item.status === "pending" ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button disabled={busy !== null} onClick={() => void respond(item.id, "accept")} className="messages-accept inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><Check size={16} strokeWidth={2.2} />{busy === item.id ? "Processing..." : "Accept invitation"}</button>
                    <button disabled={busy !== null} onClick={() => void respond(item.id, "decline")} className="messages-decline inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-40"><X size={16} strokeWidth={2} />Decline</button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}

          {messages.map((message) => (
            <article key={`message-${message.id}`} className="messages-card">
              <div className="messages-card-icon messages-account-icon" aria-hidden="true"><ShieldCheck size={19} strokeWidth={1.8} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0"><p className="messages-card-kicker">ACCOUNT UPDATE</p><h2 className="mt-1 text-[17px] font-semibold">{message.title}</h2></div>
                  <span className="messages-account-badge">Account</span>
                </div>
                <p className="messages-muted mt-2 text-sm leading-6">{message.body}</p>
                <p className="messages-faint mt-2 text-xs">{formatDate(message.createdAt)}</p>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
