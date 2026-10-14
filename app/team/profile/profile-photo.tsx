"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon } from "@heroicons/react/24/outline";
export default function ProfilePhoto({ initial, photoUrl }: { initial: string; photoUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [photo, setPhoto] = useState(photoUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <div>
    <div className="relative size-24">
      <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-white/10 text-3xl font-semibold">
        {photo ? <Image unoptimized src={photo} alt="Foto profil" width={96} height={96} className="size-24 object-cover" /> : initial}
      </div>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="absolute bottom-0 right-0 flex size-9 items-center justify-center rounded-full border border-[#171717] bg-white text-black disabled:opacity-50" aria-label="Ubah foto profil">
        <CameraIcon className="size-4" />
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || busy) return;
        if (file.size > 5 * 1024 * 1024) { setMessage("Ukuran foto maksimal 5 MB."); return; }
        setBusy(true); setMessage("Mengunggah…");
        try {
          const body = new FormData(); body.set("photo", file);
          const response = await fetch("/api/profile/photo", { method: "POST", body });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Unggah gagal.");
          setPhoto(data.photoUrl); setMessage("Foto tersimpan."); router.refresh();
        } catch (error) { setMessage(error instanceof Error ? error.message : "Unggah gagal."); }
        finally { setBusy(false); }
      }} />
    </div>
    {message && <p role="status" className="mt-2 max-w-40 text-xs">{message}</p>}
  </div>;
}
