"use client";

import { Bell, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type ToastMessage = { key: string; title: string; body: string; href: string };
type Invitation = { id: number; status: string; workspaceName: string; projectNames?: string[] };
type AccountMessage = { id: number; title: string; body: string };

const POLL_INTERVAL = 5_000;
const DISPLAY_DURATION = 5_000;

export default function MessageToastWatcher() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [visible, setVisible] = useState(false);
  const knownKeys = useRef<Set<string> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((nextToast: ToastMessage) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (removeTimer.current) clearTimeout(removeTimer.current);
    setToast(nextToast);
    requestAnimationFrame(() => setVisible(true));
    hideTimer.current = setTimeout(() => setVisible(false), DISPLAY_DURATION - 300);
    removeTimer.current = setTimeout(() => setToast(null), DISPLAY_DURATION);
  }, []);

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/invitations", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { invitations?: Invitation[]; messages?: AccountMessage[] };
      const invitations = (data.invitations ?? []).filter((item) => item.status === "pending");
      const messages = data.messages ?? [];
      const currentKeys = new Set([
        ...invitations.map((item) => `invitation:${item.id}`),
        ...messages.map((item) => `message:${item.id}`),
      ]);

      if (knownKeys.current) {
        const newMessage = messages.find((item) => !knownKeys.current?.has(`message:${item.id}`));
        const newInvitation = invitations.find((item) => !knownKeys.current?.has(`invitation:${item.id}`));
        if (newMessage) {
          showToast({ key: `message:${newMessage.id}`, title: newMessage.title, body: newMessage.body, href: "/team/invitations" });
        } else if (newInvitation) {
          const projectName = newInvitation.projectNames?.[0];
          showToast({
            key: `invitation:${newInvitation.id}`,
            title: projectName ? "New project invitation" : "New workspace invitation",
            body: projectName ?? newInvitation.workspaceName,
            href: `/team/invitations#invitation-${newInvitation.id}`,
          });
        }
      }
      knownKeys.current = currentKeys;
    } catch {
      // A transient polling failure must not interrupt the workspace UI.
    }
  }, [showToast]);

  useEffect(() => {
    void poll();
    const interval = window.setInterval(() => void poll(), POLL_INTERVAL);
    const handleVisibility = () => { if (document.visibilityState === "visible") void poll(); };
    const handlePreview = (event: Event) => {
      const detail = (event as CustomEvent<Partial<ToastMessage>>).detail;
      showToast({ key: detail.key ?? "preview", title: detail.title ?? "New message", body: detail.body ?? "You have a new notification in Clickme.", href: detail.href ?? "/team/invitations" });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("clickme-message-toast", handlePreview);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("clickme-message-toast", handlePreview);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (removeTimer.current) clearTimeout(removeTimer.current);
    };
  }, [poll, showToast]);

  if (!toast) return null;

  return (
    <aside className={`message-toast ${visible ? "message-toast-visible" : ""}`} role="status" aria-live="polite">
      <div className="message-toast-icon" aria-hidden="true"><Bell size={19} strokeWidth={1.9} /></div>
      <div className="min-w-0 flex-1">
        <p className="message-toast-label">NEW MESSAGE</p>
        <h2 className="mt-1 truncate text-sm font-semibold">{toast.title}</h2>
        <p className="message-toast-body mt-1 line-clamp-2 text-xs leading-5">{toast.body}</p>
        <Link href={toast.href} className="message-toast-link mt-2 inline-flex items-center gap-1 text-xs font-semibold">View message <ExternalLink size={12} /></Link>
      </div>
      <button type="button" onClick={() => setVisible(false)} className="message-toast-close" aria-label="Dismiss notification"><X size={16} /></button>
      <span className="message-toast-progress" aria-hidden="true" />
    </aside>
  );
}
