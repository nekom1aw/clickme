import bcrypt from "bcryptjs";
import type { DbResult, DbRow } from "@/lib/db";
import db from "@/lib/db";
import { EmailVerificationError, ensureEmailVerificationSchema, issueVerificationCode } from "@/lib/email-verification";
import { getSessionUserId, revokeOtherSessions } from "@/lib/session";
import { hitRateLimit } from "@/lib/rate-limit";

type UserRow = DbRow & {
  id: number;
  email: string;
  password_hash: string;
};

export async function PATCH(request: Request) {
  const userId = await getSessionUserId();
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Silakan login kembali." }, { status: 401 });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const direktorat = String(body.direktorat ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");

  if (name.length < 2 || name.length > 120) return Response.json({ error: "Nama harus terdiri dari 2–120 karakter." }, { status: 400 });
  if (direktorat.length > 120) return Response.json({ error: "Nama direktorat maksimal 120 karakter." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) return Response.json({ error: "Masukkan alamat email yang valid." }, { status: 400 });
  if (newPassword && newPassword.length < 8) return Response.json({ error: "Password baru minimal 8 karakter." }, { status: 400 });
  if (newPassword !== confirmPassword) return Response.json({ error: "Konfirmasi password baru tidak sama." }, { status: 400 });

  const [users] = await db.query<UserRow[]>("SELECT id,email,password_hash FROM users WHERE id=? LIMIT 1", [userId]);
  const user = users[0];
  if (!user) return Response.json({ error: "Akun tidak ditemukan." }, { status: 404 });

  const emailChanged = email !== user.email.toLowerCase();
  const sensitiveChange = emailChanged || Boolean(newPassword);
  const passwordBucket = `password-check:user:${userId}`;
  if (sensitiveChange && (await hitRateLimit(passwordBucket, 8, 15 * 60))) {
    return Response.json({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }, { status: 429 });
  }
  if (sensitiveChange && (!currentPassword || !(await bcrypt.compare(currentPassword, user.password_hash)))) {
    return Response.json({ error: "Password saat ini salah." }, { status: 403 });
  }

  const [duplicate] = await db.query<DbRow[]>("SELECT id FROM users WHERE email=? AND id<>? LIMIT 1", [email, userId]);
  if (duplicate.length) return Response.json({ error: "Email sudah digunakan oleh akun lain." }, { status: 409 });

  const passwordHash = newPassword ? await bcrypt.hash(newPassword, 10) : user.password_hash;
  // A new email only takes effect after its code is confirmed (see /api/profile/email/verify).
  await db.execute<DbResult>("UPDATE users SET name=?,direktorat=?,password_hash=? WHERE id=?", [name, direktorat || null, passwordHash, userId]);
  if (newPassword) await revokeOtherSessions(userId);
  if (!emailChanged) {
    await db.execute("UPDATE users SET pending_email=NULL WHERE id=?", [userId]);
    return Response.json({ user: { id: userId, name, direktorat, email: user.email }, pendingEmail: null });
  }

  await ensureEmailVerificationSchema();
  try {
    await issueVerificationCode(userId, email, name, true, "email-change");
  } catch (error) {
    if (error instanceof EmailVerificationError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
  // Only recorded once a code for this exact address has been sent.
  await db.execute("UPDATE users SET pending_email=? WHERE id=?", [email, userId]);
  return Response.json({ user: { id: userId, name, direktorat, email: user.email }, pendingEmail: email });
}
