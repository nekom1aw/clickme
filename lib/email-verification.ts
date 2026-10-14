import "server-only";

import { createHmac, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import db from "@/lib/db";
import type { DbRow } from "@/lib/db";

const CODE_LIFETIME_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

export class EmailVerificationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function codeSecret() {
  const secret = process.env.OTP_SECRET ?? process.env.SMTP_PASSWORD;
  if (!secret) throw new EmailVerificationError("Email verification is not configured.", 503);
  return secret;
}

function hashCode(userId: number, code: string) {
  return createHmac("sha256", codeSecret()).update(`${userId}:${code}`).digest("hex");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

export async function ensureEmailVerificationSchema() {
  const [columns] = await db.query<DbRow[]>("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'email_verified_at'");
  if (!columns.length) {
    await db.execute("ALTER TABLE users ADD COLUMN email_verified_at timestamptz NULL");
    await db.execute("UPDATE users SET email_verified_at=COALESCE(created_at,NOW()) WHERE email_verified_at IS NULL");
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS email_verification_codes (
    user_id integer PRIMARY KEY CONSTRAINT fk_email_verification_user REFERENCES users (id) ON DELETE CASCADE,
    code_hash varchar(64) NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts smallint NOT NULL DEFAULT 0,
    last_sent_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  // A new address waits here until its code is confirmed, so an unverified email
  // never replaces users.email (invitations and sign-in match on that column).
  await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email varchar(180) NULL");
}

type CodePurpose = "signup" | "email-change";

async function sendCodeEmail(to: string, name: string, code: string, purpose: CodePurpose) {
  const intro = purpose === "email-change"
    ? "Use this verification code to confirm your new Clickme email address"
    : "Use this verification code to finish creating your Clickme account";
  const htmlIntro = purpose === "email-change"
    ? "enter this code to confirm your new Clickme email address."
    : "enter this code to finish creating your Clickme account.";
  const ignoreNote = purpose === "email-change"
    ? "If you did not request this change, you can ignore this email."
    : "If you did not create this account, you can ignore this email.";
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !password || !from) throw new EmailVerificationError("Verification email could not be sent.", 503);
  const port = Number(process.env.SMTP_PORT ?? 587);
  const safeName = escapeHtml(name);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass: password.replace(/\s+/g, "") },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transport.sendMail({
    from,
    to,
    subject: `${code} is your Clickme verification code`,
    text: `Hello ${name},\n\n${intro}:\n\n${code}\n\nThis code expires in ${CODE_LIFETIME_MINUTES} minutes. ${ignoreNote}`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:36px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#fff;border:1px solid #e4e4e7"><tr><td style="padding:24px 30px;background:#18181b;color:#fff;font-size:22px;font-weight:700">Clickme</td></tr><tr><td style="padding:34px 30px"><p style="margin:0 0 8px;font-size:14px;color:#71717a">EMAIL VERIFICATION</p><h1 style="margin:0 0 14px;font-size:27px;line-height:1.3">Verify your email address</h1><p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#52525b">Hello ${safeName}, ${htmlIntro}</p><div style="padding:20px;border:1px solid #d4d4d8;background:#fafafa;text-align:center;font-size:34px;font-weight:700;letter-spacing:10px">${code}</div><p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#71717a">This code expires in ${CODE_LIFETIME_MINUTES} minutes. Never share this code with anyone.</p></td></tr><tr><td align="center" style="padding:18px 30px;border-top:1px solid #e4e4e7;background:#fafafa;font-size:12px;color:#71717a">Automated Clickme notification · Please do not reply</td></tr></table></td></tr></table></body></html>`,
  });
}

export async function issueVerificationCode(userId: number, email: string, name: string, enforceCooldown = true, purpose: CodePurpose = "signup") {
  await ensureEmailVerificationSchema();
  if (enforceCooldown) {
    const [existing] = await db.query<DbRow[]>("SELECT FLOOR(EXTRACT(EPOCH FROM (NOW() - last_sent_at)))::int AS seconds_since FROM email_verification_codes WHERE user_id=? LIMIT 1", [userId]);
    if (existing[0] && Number(existing[0].seconds_since) < RESEND_COOLDOWN_SECONDS) {
      const wait = RESEND_COOLDOWN_SECONDS - Number(existing[0].seconds_since);
      throw new EmailVerificationError(`Please wait ${wait} seconds before requesting another code.`, 429);
    }
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.execute(`INSERT INTO email_verification_codes (user_id,code_hash,expires_at,attempts,last_sent_at)
    VALUES (?,?,NOW() + make_interval(mins => ?::int),0,NOW())
    ON CONFLICT (user_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=0,last_sent_at=NOW()`, [userId, hashCode(userId, code), CODE_LIFETIME_MINUTES]);
  try { await sendCodeEmail(email, name, code, purpose); }
  catch (error) {
    await db.execute("DELETE FROM email_verification_codes WHERE user_id=?", [userId]);
    if (error instanceof EmailVerificationError) throw error;
    throw new EmailVerificationError("Verification email could not be sent. Please try again.", 503);
  }
}

export async function verifyEmailCode(email: string, code: string) {
  await ensureEmailVerificationSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<DbRow[]>(`SELECT u.id,u.name,u.direktorat,u.email,u.photo_url,u.email_verified_at,v.code_hash,v.expires_at,v.attempts
      FROM users u LEFT JOIN email_verification_codes v ON v.user_id=u.id WHERE u.email=? LIMIT 1 FOR UPDATE OF u`, [email]);
    const user = rows[0];
    if (!user) throw new EmailVerificationError("Account not found.", 404);
    // Never hand back a verified account here: the caller signs the user in, so
    // skipping the code check would let anyone log in as any verified email.
    if (user.email_verified_at) throw new EmailVerificationError("This email is already verified. Please sign in.", 409);
    if (!user.code_hash) throw new EmailVerificationError("Request a new verification code.", 400);
    if (new Date(user.expires_at).getTime() < Date.now()) throw new EmailVerificationError("Verification code has expired. Request a new code.", 410);
    if (Number(user.attempts) >= MAX_ATTEMPTS) throw new EmailVerificationError("Too many failed attempts. Request a new code.", 429);
    if (hashCode(Number(user.id), code) !== user.code_hash) {
      await connection.execute("UPDATE email_verification_codes SET attempts=attempts+1 WHERE user_id=?", [user.id]);
      await connection.commit();
      throw new EmailVerificationError("The verification code is incorrect.", 400);
    }
    await connection.execute("UPDATE users SET email_verified_at=NOW() WHERE id=?", [user.id]);
    await connection.execute("DELETE FROM email_verification_codes WHERE user_id=?", [user.id]);
    await connection.commit();
    return user;
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally { connection.release(); }
}

export async function getUnverifiedUser(email: string) {
  await ensureEmailVerificationSchema();
  const [rows] = await db.query<DbRow[]>("SELECT id,name,email,email_verified_at FROM users WHERE email=? LIMIT 1", [email]);
  const user = rows[0];
  return user && !user.email_verified_at ? user : null;
}

/** Moves a confirmed pending_email into users.email. */
export async function confirmPendingEmail(userId: number, code: string) {
  await ensureEmailVerificationSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<DbRow[]>(`SELECT u.id,u.name,u.email,u.pending_email,v.code_hash,v.expires_at,v.attempts
      FROM users u LEFT JOIN email_verification_codes v ON v.user_id=u.id WHERE u.id=? LIMIT 1 FOR UPDATE OF u`, [userId]);
    const user = rows[0];
    if (!user?.pending_email) throw new EmailVerificationError("There is no email change waiting for verification.", 400);
    if (!user.code_hash) throw new EmailVerificationError("Request a new verification code.", 400);
    if (new Date(user.expires_at).getTime() < Date.now()) throw new EmailVerificationError("Verification code has expired. Request a new code.", 410);
    if (Number(user.attempts) >= MAX_ATTEMPTS) throw new EmailVerificationError("Too many failed attempts. Request a new code.", 429);
    if (hashCode(Number(user.id), code) !== user.code_hash) {
      await connection.execute("UPDATE email_verification_codes SET attempts=attempts+1 WHERE user_id=?", [user.id]);
      await connection.commit();
      throw new EmailVerificationError("The verification code is incorrect.", 400);
    }
    const [taken] = await connection.query<DbRow[]>("SELECT id FROM users WHERE email=? AND id<>? LIMIT 1", [user.pending_email, user.id]);
    if (taken.length) throw new EmailVerificationError("This email is already used by another account.", 409);
    await connection.execute("UPDATE users SET email=pending_email,pending_email=NULL,email_verified_at=NOW() WHERE id=?", [user.id]);
    await connection.execute("DELETE FROM email_verification_codes WHERE user_id=?", [user.id]);
    await connection.commit();
    return { name: String(user.name), oldEmail: String(user.email), newEmail: String(user.pending_email) };
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally { connection.release(); }
}
