import { redirect } from "next/navigation";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import type { DbRow } from "@/lib/db";
import ProfilePhoto from "./profile-photo";
import ProfileForm from "./profile-form";
import db from "@/lib/db";
import { ensureEmailVerificationSchema } from "@/lib/email-verification";
import { getSessionUserId } from "@/lib/session";

type UserRow = DbRow & {
  id: number;
  name: string;
  direktorat: string | null;
  email: string;
  pending_email: string | null;
  photo_url: string | null;
};

async function getCurrentUser() {
  const userId = await getSessionUserId();

  if (!userId) {
    redirect("/login");
  }

  await ensureEmailVerificationSchema();
  const [rows] = await db.query<UserRow[]>(
    `SELECT id, name, direktorat, email, pending_email, photo_url
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId],
  );

  const user = rows[0];

  if (!user) {
    redirect("/login");
  }

  return user;
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  const initial = user.name.trim()[0]?.toUpperCase() ?? "U";

  return (
    <main className="min-h-screen bg-[#0f0f10] px-6 py-10 text-white lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-white/55"><ShieldCheckIcon className="size-4" />Account settings</div>
          <h1 className="text-3xl font-semibold tracking-tight">My Profile</h1>
          <p className="mt-2 text-sm text-white/40">Kelola identitas, email, foto, dan keamanan akun Anda.</p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-2xl border border-white/10 bg-[#171717] p-6 lg:sticky lg:top-6">
            <ProfilePhoto initial={initial} photoUrl={user.photo_url} />
            <h2 className="mt-5 text-lg font-semibold">{user.name}</h2>
            <p className="mt-1 break-all text-sm text-white/45">{user.email}</p>
            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="text-xs uppercase tracking-wider text-white/30">Direktorat</p>
              <p className="mt-1 text-sm text-white/65">{user.direktorat || "Belum diisi"}</p>
            </div>
          </aside>
          <ProfileForm user={{ name: user.name, direktorat: user.direktorat ?? "", email: user.email, pendingEmail: user.pending_email }} />
        </div>
      </div>
    </main>
  );
}
