import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { hitRateLimit } from "@/lib/rate-limit";
import { sendWahaText } from "@/lib/waha";
import {
  ensureWhatsappGroupConnectionSchema,
  getWhatsappScopeName,
  hashWhatsappConnectCode,
  type WhatsappScopeType,
} from "@/lib/whatsapp-group-connections";

export const dynamic = "force-dynamic";

type PendingConnectionRow = DbRow & {
  id: number;
  scope_type: WhatsappScopeType;
  scope_id: number;
};

function stringValue(...values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function getMessageData(body: Record<string, unknown>) {
  const payload =
    body.payload && typeof body.payload === "object"
      ? (body.payload as Record<string, unknown>)
      : body;
  const message =
    payload.message && typeof payload.message === "object"
      ? (payload.message as Record<string, unknown>)
      : {};
  const id =
    payload.id && typeof payload.id === "object"
      ? (payload.id as Record<string, unknown>)
      : {};
  const fromMe = Boolean(payload.fromMe ?? id.fromMe);

  return {
    chatId: stringValue(
      fromMe ? payload.to : undefined,
      payload.from,
      payload.chatId,
      payload.chat_id,
      id.remote,
      id.remoteJid,
    ),
    text: stringValue(
      payload.body,
      payload.text,
      message.conversation,
      message.text,
    ),
    groupName: stringValue(
      payload.chatName,
      payload.chat_name,
      payload.notifyName,
    ),
    fromMe,
  };
}

function secretMatches(candidate: string | null, expected: string) {
  if (!candidate) return false;
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

// Fails closed: without a configured secret anyone could post forged WhatsApp events.
function isAuthorized(request: Request) {
  const expected = process.env.WAHA_WEBHOOK_SECRET?.trim();
  if (!expected) return false;

  const url = new URL(request.url);
  return (
    secretMatches(request.headers.get("x-webhook-secret"), expected) ||
    secretMatches(url.searchParams.get("secret"), expected)
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Webhook secret tidak valid." }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const message = getMessageData(body);

  if (!message.chatId?.endsWith("@g.us") || !message.text) {
    return NextResponse.json({ ignored: true });
  }

  const match = message.text
    .trim()
    .match(/^\/connect\s+(CONNECT-[A-Z0-9]+)\s*$/i);
  if (!match) {
    return NextResponse.json({ ignored: true });
  }

  const attemptBucket = `waha-connect:${message.chatId}`;
  if (await hitRateLimit(attemptBucket, 10, 10 * 60)) {
    return NextResponse.json({ ignored: true }, { status: 429 });
  }

  await ensureWhatsappGroupConnectionSchema();
  const codeHash = hashWhatsappConnectCode(match[1]);
  const [rows] = await db.query<PendingConnectionRow[]>(
    `SELECT id, scope_type, scope_id
     FROM whatsapp_group_connections
     WHERE connect_code_hash = ?
       AND connect_code_expires_at >= NOW()
       AND group_chat_id IS NULL
     LIMIT 1`,
    [codeHash],
  );
  const connection = rows[0];

  if (!connection) {
    await sendWahaText({
      recipient: message.chatId,
      text: "Kode koneksi tidak valid atau sudah kedaluwarsa.",
    });
    return NextResponse.json({ connected: false }, { status: 404 });
  }

  await db.execute(
    `UPDATE whatsapp_group_connections
     SET group_chat_id = ?, group_name = ?, connected_at = NOW(),
         connect_code_hash = NULL, connect_code_expires_at = NULL
     WHERE id = ?`,
    [message.chatId, message.groupName ?? null, connection.id],
  );

  const scopeName =
    (await getWhatsappScopeName(connection.scope_type, connection.scope_id)) ??
    "Clickme";
  const label =
    connection.scope_type === "workspace" ? "Workspace" : "Project";

  try {
    await sendWahaText({
      recipient: message.chatId,
      text: `Grup berhasil terhubung ke ${label}: ${scopeName}`,
    });
  } catch (error) {
    console.error("WAHA confirmation failed after group was connected", error);
  }

  return NextResponse.json({
    connected: true,
    scopeType: connection.scope_type,
    scopeId: connection.scope_id,
  });
}
