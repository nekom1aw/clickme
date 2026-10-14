"use client";

import { useEffect, useRef, useState } from "react";
import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";

export default function RemoveMemberDialog({ member, workspaceName, onClose, onConfirm, kind = "member" }: {
  kind?: "member" | "workspace" | "project";
  member: { name: string; email: string };
  workspaceName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => { element?.close(); previousFocus?.focus(); };
  }, []);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await onConfirm(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal menghapus anggota. Coba lagi."); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} aria-labelledby="remove-member-title" aria-describedby="remove-member-description"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-[440px] overflow-hidden rounded-2xl border border-white/10 bg-[#1b1b1e] p-0 text-white shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm">
    <div className="relative p-6">
      <button type="button" aria-label="Tutup" disabled={busy} onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-white/70 disabled:opacity-40"><XMarkIcon className="size-5" /></button>
      <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-red-400/15 bg-red-400/10 text-red-400"><TrashIcon className="size-6" /></div>
      <h2 id="remove-member-title" className="text-xl font-semibold tracking-tight">{kind === "workspace" ? "Hapus workspace?" : kind === "project" ? "Hapus project?" : "Hapus anggota?"}</h2>
      <p id="remove-member-description" className="mt-2 text-sm leading-6 text-white/55">{kind === "workspace" ? <>Workspace <span className="font-medium text-white/85">{workspaceName}</span>, seluruh project dan task di dalamnya akan dihapus permanen. Sinkronisasi Sheet dan koneksi grup workspace juga dihentikan. Form dan jawabannya tetap tersimpan. Tindakan ini tidak dapat dibatalkan.</> : kind === "project" ? <>Project <span className="font-medium text-white/85">{workspaceName}</span> beserta seluruh task di dalamnya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</> : <>Anggota ini akan kehilangan akses ke <span className="font-medium text-white/85">{workspaceName}</span>.</>}</p>
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-400/15 text-sm font-semibold text-violet-200">{member.name.trim().slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0"><p className="truncate text-sm font-medium">{member.name}</p><p className="truncate text-xs text-white/45">{member.email}</p></div>
      </div>
      {error ? <p role="alert" className="mt-4 text-sm text-red-300">{error}</p> : null}
    </div>
    <div className="flex justify-end gap-2 border-t border-white/[0.07] bg-black/10 px-6 py-4">
      <button ref={cancel} type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-white/70 disabled:opacity-40">Batal</button>
      <button type="button" disabled={busy} onClick={() => void confirm()} className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400 focus-visible:outline-2 focus-visible:outline-red-300 disabled:opacity-50">{busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" /> : <TrashIcon className="size-4" />}{busy ? "Menghapus..." : kind === "workspace" ? "Hapus workspace" : kind === "project" ? "Hapus project" : "Hapus anggota"}</button>
    </div>
  </dialog>;
}
