"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtSymbolIcon, BuildingOffice2Icon, KeyIcon, UserIcon } from "@heroicons/react/24/outline";

const input = "mt-2 h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/35 focus:ring-2 focus:ring-white/10";

export default function ProfileForm({ user }: { user: { name: string; direktorat: string; email: string; pendingEmail: string | null } }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [direktorat, setDirektorat] = useState(user.direktorat);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingEmail, setPendingEmail] = useState(user.pendingEmail);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, direktorat, email, currentPassword, newPassword, confirmPassword }) });
      const data = await response.json();
      if (data.pendingEmail !== undefined) setPendingEmail(data.pendingEmail);
      if (!response.ok) throw new Error(data.error ?? "Profil gagal disimpan.");
      setEmail(data.user.email); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setCode("");
      setMessage(data.pendingEmail
        ? `Kode verifikasi dikirim ke ${data.pendingEmail}. Email akun baru berubah setelah kode dimasukkan.`
        : "Perubahan profil berhasil disimpan.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Profil gagal disimpan."); }
    finally { setBusy(false); }
  }

  async function verifyEmail() {
    if (code.length !== 6 || verifying) return;
    setVerifying(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/profile/email/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Kode verifikasi gagal diperiksa.");
      setEmail(data.user.email); setPendingEmail(null); setCode("");
      setMessage(data.emailNotificationSent ? "Email berhasil diperbarui dan notifikasi dikirim ke email lama dan baru." : "Email berhasil diperbarui.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kode verifikasi gagal diperiksa."); }
    finally { setVerifying(false); }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#171717] p-6">
        <div className="mb-5"><h2 className="font-semibold">Informasi pribadi</h2><p className="mt-1 text-sm text-white/40">Informasi yang ditampilkan kepada anggota workspace lain.</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm text-white/65"><span className="flex items-center gap-2"><UserIcon className="size-4" />Nama lengkap</span><input value={name} onChange={(event) => setName(event.target.value)} className={input} autoComplete="name" /></label>
          <label className="text-sm text-white/65"><span className="flex items-center gap-2"><BuildingOffice2Icon className="size-4" />Direktorat</span><input value={direktorat} onChange={(event) => setDirektorat(event.target.value)} className={input} placeholder="Nama direktorat" /></label>
          <label className="text-sm text-white/65 sm:col-span-2"><span className="flex items-center gap-2"><AtSymbolIcon className="size-4" />Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={input} autoComplete="email" /><span className="mt-2 block text-xs text-white/30">Perubahan email memerlukan password saat ini.</span></label>
        </div>
      </section>

      {pendingEmail ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-6">
          <h2 className="font-semibold">Verifikasi email baru</h2>
          <p className="mt-1 text-sm text-white/50">Masukkan kode 6 digit yang dikirim ke <span className="font-semibold text-white/80">{pendingEmail}</span>. Sampai diverifikasi, akun tetap memakai email lama.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void verifyEmail(); } }} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Kode verifikasi email" className={`${input} mt-0 max-w-44 text-center tracking-[0.4em]`} />
            <button type="button" onClick={() => void verifyEmail()} disabled={verifying || code.length !== 6} className="form-save-button h-11 rounded-lg bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/85 disabled:opacity-50">{verifying ? "Memeriksa..." : "Verifikasi email"}</button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-[#171717] p-6">
        <div className="mb-5"><h2 className="flex items-center gap-2 font-semibold"><KeyIcon className="size-4 text-white/55" />Keamanan akun</h2><p className="mt-1 text-sm text-white/40">Kosongkan password baru jika tidak ingin menggantinya.</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm text-white/65 sm:col-span-2"><span>Password saat ini</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={input} autoComplete="current-password" placeholder="Diperlukan untuk email atau password baru" /></label>
          <label className="text-sm text-white/65"><span>Password baru</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={input} autoComplete="new-password" placeholder="Minimal 8 karakter" /></label>
          <label className="text-sm text-white/65"><span>Konfirmasi password baru</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={input} autoComplete="new-password" placeholder="Ulangi password baru" /></label>
        </div>
      </section>

      {error ? <p role="alert" className="rounded-lg border border-red-400/15 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
      {message ? <p role="status" className="rounded-lg border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">{message}</p> : null}
      <div className="flex justify-end"><button type="submit" disabled={busy} className="form-save-button rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/85 disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan perubahan"}</button></div>
    </form>
  );
}
