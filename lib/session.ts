import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { cache } from "react";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// The old cookie held a raw user id that anyone could forge; it is cleared on login/logout.
const LEGACY_USER_COOKIE = "clickme_user_id";
const SESSION_DURATION_MS = 30 * 86_400_000;

let schemaPromise: Promise<void> | null = null;

async function createSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash char(64) PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at timestamptz NOT NULL
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id)`,
  );
}

export async function ensureSessionSchema() {
  schemaPromise ??= createSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}

// Only the hash is stored, so a leaked sessions table cannot be replayed as cookies.
function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookieIsSecure() {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export async function createSession(response: NextResponse, userId: number) {
  await ensureSessionSchema();

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.execute(
    `INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
    [hashSessionToken(token), userId, expiresAt],
  );
  await db.execute(`DELETE FROM user_sessions WHERE expires_at <= NOW()`);

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieIsSecure(),
    path: "/",
    expires: expiresAt,
  });
  response.cookies.delete(LEGACY_USER_COOKIE);
}

/** Returns the signed-in user's id, or 0 when there is no valid session. */
export const getSessionUserId = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return 0;
  }

  await ensureSessionSchema();
  const [rows] = await db.query<(DbRow & { user_id: number })[]>(
    `SELECT user_id
     FROM user_sessions
     WHERE token_hash = ? AND expires_at > NOW()
     LIMIT 1`,
    [hashSessionToken(token)],
  );

  return Number(rows[0]?.user_id ?? 0);
});

export async function destroySession(response: NextResponse) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (token) {
    await ensureSessionSchema();
    await db.execute(`DELETE FROM user_sessions WHERE token_hash = ?`, [
      hashSessionToken(token),
    ]);
  }

  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(LEGACY_USER_COOKIE);
}

/** Signs the user out everywhere except the session making the request. */
export async function revokeOtherSessions(userId: number) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";

  await ensureSessionSchema();
  await db.execute(
    `DELETE FROM user_sessions WHERE user_id = ? AND token_hash <> ?`,
    [userId, hashSessionToken(token)],
  );
}
