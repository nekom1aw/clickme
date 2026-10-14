"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { LinkIcon, TrashIcon, LockClosedIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { mappingFields, renderSheetMessage, type SheetSettings } from "@/lib/sheet-mapping";

type Source = { googleSheetUrl: string; lastSyncedAt: string | null; settings: SheetSettings | null; paused: boolean; lastError: string | null; initialPending: boolean };
export function GoogleFormConnection({ workspaceId, workspaceName }: { workspaceId: number; workspaceName: string }) {
  const router = useRouter();
  const [source, setSource] = useState<Source | null>(null);
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [settings, setSettings] = useState<SheetSettings | null>(null);
  const [sample, setSample] = useState<Record<string,string>>({});
  const [reviewed, setReviewed] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [tab, setTab] = useState<"mapping" | "message">("mapping");
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!popupOpen || !dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, [popupOpen]);
  const endpoint = `/api/workspaces/${workspaceId}/google-form`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal memuat koneksi.");
        setSource(data);
        if (!editing) setUrl(data.googleSheetUrl);
      } catch (error) { if (error instanceof Error && error.name !== "AbortError") setError(error.message); }
    }
    void load();
    const timer = window.setInterval(load, 5000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [endpoint, editing]);

  const usedSourceColumns = new Set([
    ...Object.values(settings?.mapping ?? {}),
    ...(settings?.customMappings ?? []).map(item => item.column),
  ]);
  function availableSourceColumns(currentColumn: string) {
    return headers.filter(header => header === currentColumn || !usedSourceColumns.has(header));
  }

  function change(next: SheetSettings) { setSettings(next); setReviewed(false); }
  async function act(action: "inspect" | "preview" | "save" | "disconnect" | "sync") {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(action === "sync" ? "/api/imports/data-requests" : endpoint, {
        method: action === "sync" || action === "inspect" || action === "preview" ? "POST" : action === "save" ? "PUT" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "sync" ? { workspaceId, workspaceName } : { googleSheetUrl: url, settings: action === "save" || action === "preview" ? settings : undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pengaturan gagal diperbarui.");
      if (action === "inspect" || action === "preview") {
        setHeaders(data.headers); setSettings(data.settings); setSample(data.sample); setReviewed(action === "preview");
        setPopupOpen(true);
        setTab(action === "preview" ? "message" : "mapping");
        if (action === "preview") setNotice("Pemetaan dan template valid. Periksa pratinjau, lalu simpan untuk mengaktifkan.");
        return;
      }
      const statusResponse = await fetch(endpoint, { cache: "no-store" });
      const next = await statusResponse.json();
      if (!statusResponse.ok) throw new Error(next.error || "Gagal memuat status.");
      setSource(next); setUrl(next.googleSheetUrl); setEditing(false); setPopupOpen(false); setSettings(null); setReviewed(false);
      setNotice(action === "sync" ? `Sinkronisasi selesai: ${data.summary?.created ?? 0} task baru.` : action === "save" ? "Pengaturan tersimpan. Sinkronisasi server aktif." : "Koneksi diputus. Task tetap tersimpan.");
      if (action === "sync") router.refresh();
    } catch (error) { setReviewed(false); setError(error instanceof Error ? error.message : "Terjadi kesalahan."); }
    finally { setBusy(false); }
  }
  const button = "rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/5 disabled:opacity-50";
  const input = "w-full rounded-md border border-white/15 bg-[#202020] px-3 py-2 text-xs text-white outline-none focus:border-violet-400";
  function edit() { setEditing(true); setHeaders([]); setSettings(null); setReviewed(false); setError(""); setNotice(""); }
  return <section className="rounded-lg border border-white/10 bg-[#151515] px-3 py-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white/85"><LinkIcon className="size-4 text-white/55" />Google Form / Sheets</h3>
      <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${source?.paused ? "bg-amber-500/15 text-amber-300" : source?.googleSheetUrl ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/45"}`}>{source ? source.paused ? "Perlu pemetaan ulang" : source.googleSheetUrl ? source.initialPending ? "Menyiapkan data awal" : "Terhubung" : "Belum terhubung" : "Memuat…"}</span>
    </div>
    <p className="mt-1 text-xs leading-5 text-white/40">Pemeriksaan otomatis setiap 5 detik selama server menyala. Setiap sumber mempunyai pemetaan kolom dan pesan WhatsApp sendiri.</p>
    {source?.lastError ? <p role="alert" className="mt-2 text-xs text-amber-300">{source.lastError}</p> : null}
    {source?.googleSheetUrl && !editing ? <div className="mt-3 space-y-2">
      <a href={source.googleSheetUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-violet-300">Buka spreadsheet jawaban ↗</a>
      <p className="text-[11px] text-white/45">{source.lastSyncedAt ? `Sinkronisasi terakhir: ${new Date(source.lastSyncedAt).toLocaleString("id-ID")}` : "Menunggu sinkronisasi awal tanpa notifikasi."}</p>
      {!source.settings ? <p className="text-[11px] text-white/45">Menggunakan format Permintaan Data. Pilih Atur kolom dan pesan untuk menyesuaikan form lain.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || source.paused} className={button} onClick={() => act("sync")}>Sinkronkan sekarang</button>
        <button type="button" disabled={busy} className={button} onClick={edit}>Atur kolom dan pesan</button>
        <button type="button" disabled={busy} className={button} onClick={() => act("disconnect")}>Putuskan koneksi</button>
      </div>
    </div> : source && !editing ? <button type="button" className={`${button} mt-3`} onClick={edit}>Hubungkan Google Form</button> : null}
    {editing ? <fieldset disabled={busy} className="mt-3 space-y-3 disabled:opacity-70">
      <label className="block space-y-1 text-xs text-white/70"><span>1. URL atau ID Google Sheets</span><input value={url} onChange={event => { setUrl(event.target.value); setSettings(null); setHeaders([]); setReviewed(false); }} placeholder="URL lengkap mempertahankan pilihan tab (gid)" className={input} /></label>
      <button type="button" disabled={!url.trim() || busy} className={button} onClick={() => act("inspect")}>Baca kolom</button>
      {settings ? <button type="button" className={button} onClick={() => setPopupOpen(true)}>Lanjutkan pengaturan kolom dan pesan</button> : null}
      <button type="button" className={button} onClick={() => { setEditing(false); setUrl(source?.googleSheetUrl || ""); }}>Batal</button>
    </fieldset> : null}
    {popupOpen && settings ? createPortal(
      <dialog data-sheet-settings-dialog ref={dialogRef} aria-labelledby={`sheet-popup-title-${workspaceId}`} onCancel={event => { event.preventDefault(); if (!busy) setPopupOpen(false); }} onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-4xl overflow-hidden rounded-xl border border-white/15 bg-[#181818] p-0 text-white shadow-2xl backdrop:bg-black/75">
        <div className="flex max-h-[90dvh] flex-col">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div><h2 id={`sheet-popup-title-${workspaceId}`} className="text-lg font-semibold">Atur kolom dan pesan</h2><p className="mt-1 text-xs text-white/45">{workspaceName} · {headers.length} kolom terbaca</p></div>
            <button type="button" disabled={busy} aria-label="Tutup pengaturan kolom dan pesan" className={button} onClick={() => setPopupOpen(false)}>✕</button>
          </header>
          <div className="flex shrink-0 gap-2 border-b border-white/10 px-5 py-3">
            <button type="button" aria-pressed={tab === "mapping"} className={`${button} ${tab === "mapping" ? "bg-violet-500/20 text-violet-200" : ""}`} onClick={() => setTab("mapping")}>Pemetaan kolom</button>
            <button type="button" aria-pressed={tab === "message"} className={`${button} ${tab === "message" ? "bg-violet-500/20 text-violet-200" : ""}`} onClick={() => setTab("message")}>Pesan WhatsApp & pratinjau</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <fieldset disabled={busy} className="space-y-3 disabled:opacity-70">
              <div hidden={tab !== "mapping"} className="space-y-3">
        <div className="flex items-center justify-between gap-3 pb-1">
          <div><h3 className="text-sm font-semibold text-white/90">Petakan kolom</h3><p className="mt-1 text-xs text-white/45">Tentukan kolom Sheets untuk setiap informasi task.</p></div>
          <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/50">{mappingFields.filter(([key]) => key === "title" || key in settings.mapping).length + (settings.customMappings?.length ?? 0)} pemetaan</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/10">
          <div className="hidden grid-cols-[minmax(0,0.85fr)_20px_minmax(0,1.4fr)_32px] items-center gap-3 border-b border-white/10 bg-white/[0.025] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/35 sm:grid"><span>Informasi task</span><span /><span>Kolom di Sheets</span><span /></div>
          <div className="divide-y divide-white/[0.06]">
            {mappingFields.filter(([key]) => key === "title" || key in settings.mapping).map(([key,label,required]) => {
              const locked = required || (key === "responseId" && !settings.mapping.timestamp) || (key === "timestamp" && !settings.mapping.responseId);
              return <div key={key} className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-x-3 gap-y-2 px-4 py-2.5 transition hover:bg-white/[0.02] sm:grid-cols-[minmax(0,0.85fr)_20px_minmax(0,1.4fr)_32px]">
                <label htmlFor={`map-${workspaceId}-${key}`} className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-white/75">{label}{required ? <span className="rounded bg-violet-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-300">Wajib</span> : null}</label>
                <ArrowRightIcon aria-hidden="true" className="hidden size-3.5 text-white/20 sm:block" />
                <select id={`map-${workspaceId}-${key}`} className={`${input} col-start-1 row-start-2 min-w-0 sm:col-start-auto sm:row-start-auto`} value={settings.mapping[key] || ""} onChange={event => change({ ...settings, mapping: { ...settings.mapping, [key]: event.target.value } })}><option value="">Pilih kolom</option>{headers.map(header => <option key={header} value={header}>{header}</option>)}</select>
                {locked ? <span title="Judul dan minimal satu identitas wajib tersedia" className="col-start-2 row-start-1 flex size-8 items-center justify-center text-white/20 sm:col-start-auto sm:row-start-auto"><LockClosedIcon aria-hidden="true" className="size-3.5" /><span className="sr-only">Pemetaan wajib</span></span> : <button type="button" title={`Hapus ${label}`} aria-label={`Hapus pemetaan ${label}`} className="col-start-2 row-start-1 flex size-8 items-center justify-center rounded-md text-white/30 transition hover:bg-red-400/10 hover:text-red-300 focus-visible:outline focus-visible:outline-violet-400 sm:col-start-auto sm:row-start-auto" onClick={() => { const mapping = { ...settings.mapping }; delete mapping[key]; change({ ...settings, mapping }); }}><TrashIcon className="size-4" /></button>}
              </div>;
            })}
            {(settings.customMappings ?? []).map((item,index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-3 bg-violet-400/[0.025] px-4 py-3 sm:grid-cols-[minmax(0,0.85fr)_20px_minmax(0,1.4fr)_32px]">
              <input aria-label={`Label pemetaan tambahan ${index + 1}`} className={input} maxLength={100} placeholder="Label, mis. Jabatan pemohon" value={item.label} onChange={event => change({ ...settings, customMappings: settings.customMappings?.map((entry,i) => i === index ? { ...entry, label: event.target.value } : entry) })} />
              <ArrowRightIcon aria-hidden="true" className="hidden size-3.5 text-white/20 sm:block" />
              <select aria-label={`Kolom sumber pemetaan tambahan ${index + 1}`} className={`${input} col-start-1 row-start-2 min-w-0 sm:col-start-auto sm:row-start-auto`} value={item.column} onChange={event => change({ ...settings, customMappings: settings.customMappings?.map((entry,i) => i === index ? { ...entry, column: event.target.value } : entry) })}><option value="">Pilih kolom sumber</option>{availableSourceColumns(item.column).map(header => <option key={header} value={header}>{header}</option>)}</select>
              <button type="button" title="Hapus pemetaan" className="col-start-2 row-start-1 flex size-8 items-center justify-center rounded-md text-white/30 transition hover:bg-red-400/10 hover:text-red-300 focus-visible:outline focus-visible:outline-violet-400 sm:col-start-auto sm:row-start-auto" aria-label={`Hapus pemetaan tambahan ${index + 1}`} onClick={() => change({ ...settings, customMappings: settings.customMappings?.filter((_,i) => i !== index) })}><TrashIcon className="size-4" /></button>
            </div>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={(settings.customMappings?.length ?? 0) >= 30} onClick={() => change({ ...settings, customMappings: [...(settings.customMappings ?? []), { label: "", column: "" }] })}>+ Tambah pemetaan</button></div>
        <p className="text-[11px] text-white/45">Pemetaan tambahan masuk ke deskripsi task. Labelnya juga bisa dipakai sebagai {"{{Label}}"} dalam pesan WhatsApp. Setelah menghapus pemetaan, hapus placeholder terkait dari template jika tidak dipakai lagi.</p>
        <p className="text-[11px] leading-5 text-white/45">Gunakan Response ID jika tersedia. Jika tidak, pilih waktu jawaban; waktu digabung dengan email atau nama pemohon. Identitas harus unik dan tetap sama saat jawaban diedit.</p>
        <label className="block space-y-1 text-xs text-white/70"><span>Project tujuan jika kategori kosong</span><input className={input} maxLength={100} value={settings.defaultProject} onChange={event => change({ ...settings, defaultProject: event.target.value })} /></label>
        <p className="text-[11px] text-white/45">Isi kolom kategori menjadi nama project. Project baru dibuat jika belum tersedia.</p>
        <p className="text-xs text-white/70">Kolom dalam deskripsi task</p>
        <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border border-white/10 p-2 sm:grid-cols-2">{headers.map(header => <label key={header} className="flex items-start gap-2 text-[11px] text-white/60"><input type="checkbox" checked={settings.descriptionColumns.includes(header)} onChange={event => change({ ...settings, descriptionColumns: event.target.checked ? [...settings.descriptionColumns,header] : settings.descriptionColumns.filter(item => item !== header) })} />{header}</label>)}</div>
              </div>
              <div hidden={tab !== "message"} className="space-y-3">
        <label className="block space-y-1 text-xs text-white/70"><span>Template pesan WhatsApp</span><textarea rows={7} className={input} maxLength={20000} value={settings.template} onChange={event => change({ ...settings, template: event.target.value })} /></label>
        <select aria-label="Tambahkan kolom ke template" className={input} value="" onChange={event => { if (event.target.value) change({ ...settings, template: `${settings.template}\n${event.target.value}: {{${event.target.value}}}` }); }}><option value="">Tambahkan kolom ke pesan…</option>{[...new Set([...headers, ...(settings.customMappings ?? []).filter(item => item.label.trim() && item.column).map(item => item.label.trim())])].map(header => <option key={header} value={header}>{header}</option>)}</select>
        <p className="text-[11px] text-white/45">Gunakan {"{{Nama kolom}}"}. Link monitoring ditambahkan otomatis. Kolom kosong ditampilkan sebagai “-”.</p>
        {reviewed ? <div className="space-y-2 rounded-md border border-violet-400/20 bg-black/20 p-3"><p className="text-xs font-semibold text-white/80">Pratinjau jawaban pertama</p><p className="break-words text-xs text-white/60">Task: {Array.from(sample[settings.mapping.title || ""] || "(belum ada jawaban)").slice(0,180).join("")}</p><p className="text-xs text-white/60">Project: {sample[settings.mapping.category || ""] || settings.defaultProject}</p><pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-white/70">{renderSheetMessage(settings.template,sample,settings)}</pre></div> : null}
              </div>
            </fieldset>
          </div>
          <footer className="shrink-0 space-y-2 border-t border-white/10 bg-[#181818] px-5 py-3">
        <p className="rounded-md bg-emerald-500/5 p-2 text-[11px] leading-5 text-emerald-200/70">Saat sumber baru diaktifkan, data awal diimpor tanpa notifikasi. Hanya jawaban baru berikutnya yang dikirim ke WhatsApp. Kolom yang dipakai hilang akan menjeda sumber hingga dipetakan ulang.</p>
            {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
            {notice ? <p role="status" className="text-xs text-emerald-300">{notice}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" disabled={busy} className={button} onClick={() => setPopupOpen(false)}>Kembali</button>
              {tab === "mapping" ? <button type="button" className={button} onClick={() => setTab("message")}>Lanjut ke pesan</button> : <button type="button" disabled={busy} className={button} onClick={() => act("preview")}>Periksa dan pratinjau</button>}
              <button type="button" disabled={!reviewed || busy} className={`${button} bg-violet-500/20`} onClick={() => act("save")}>{busy ? "Memproses…" : "Simpan dan aktifkan"}</button>
            </div>
          </footer>
        </div>
      </dialog>, document.body,
    ) : null}
    {busy ? <p className="mt-2 text-xs text-white/45">Memproses…</p> : null}
    {error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}
    {notice ? <p role="status" className="mt-2 text-xs text-emerald-300">{notice}</p> : null}
  </section>;
}
