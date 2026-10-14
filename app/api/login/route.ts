import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureEmailVerificationSchema, issueVerificationCode } from "@/lib/email-verification";
import { clearRateLimit, getClientIp, hitRateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const UNKNOWN_USER_HASH = bcrypt.hashSync("clickme-unknown-user", 10);
const LOGIN_WINDOW_SECONDS = 15 * 60;

type UserRow = DbRow & {
  id: number;
  name: string;
  direktorat: string | null;
  email: string;
  password_hash: string;
  photo_url: string | null;
  email_verified_at: Date | string | null;
};

export async function POST(request: Request) {
  // A cross-site HTML form can't send JSON, so this blocks login CSRF.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Format request tidak valid." }, { status: 415 });
  }

  await ensureEmailVerificationSchema();
  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email dan password wajib diisi." },
      { status: 400 },
    );
  }

  const ip = getClientIp(request);
  const emailIpBucket = `login:email-ip:${email}:${ip}`;
  const emailBucket = `login:email:${email}`;
  const ipBucket = `login:ip:${ip}`;

  // Tight per (email, IP) limit; a looser per-email ceiling keeps distributed
  // guessing slow without letting one attacker lock the owner out as easily.
  if (
    (await hitRateLimit(emailIpBucket, 8, LOGIN_WINDOW_SECONDS)) ||
    (await hitRateLimit(emailBucket, 30, LOGIN_WINDOW_SECONDS)) ||
    (await hitRateLimit(ipBucket, 60, LOGIN_WINDOW_SECONDS))
  ) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." },
      { status: 429 },
    );
  }

  const [rows] = await db.query<UserRow[]>(
    `SELECT id, name, direktorat, email, password_hash, photo_url, email_verified_at
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email],
  );

  const user = rows[0];
  const passwordValid = await bcrypt.compare(
    password,
    user?.password_hash ?? UNKNOWN_USER_HASH,
  );

  if (!user || !passwordValid) {
    return NextResponse.json(
      { error: "Email atau password salah." },
      { status: 401 },
    );
  }

  if (!user.email_verified_at) {
    try { await issueVerificationCode(user.id, user.email, user.name, true); } catch {}
    return NextResponse.json({ error: "Verify your email before signing in.", verificationRequired: true, email: user.email }, { status: 403 });
  }

  const response = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      direktorat: user.direktorat ?? "",
      email: user.email,
      photoUrl: user.photo_url ?? "",
    },
  });

  await clearRateLimit(emailIpBucket, emailBucket);
  await createSession(response, user.id);

  return response;
}
