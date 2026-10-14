import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  canManageWhatsappScope,
  createWhatsappConnectCode,
  ensureWhatsappGroupConnectionSchema,
  getWhatsappGroupConnection,
  getWhatsappScopeName,
  saveWhatsappConnectCode,
  type WhatsappScopeType,
} from "@/lib/whatsapp-group-connections";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseScope(value: string | null): WhatsappScopeType | null {
  return value === "workspace" || value === "project" ? value : null;
}

function parseScopeId(value: unknown) {
  const scopeId = Number(value);
  return Number.isInteger(scopeId) && scopeId > 0 ? scopeId : null;
}

async function getRequestContext(request: Request, body?: unknown) {
  const userId = await getSessionUserId();
  const url = new URL(request.url);
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const scopeType = parseScope(
    String(payload.scopeType ?? url.searchParams.get("scopeType") ?? ""),
  );
  const scopeId = parseScopeId(
    payload.scopeId ?? url.searchParams.get("scopeId"),
  );

  return { userId, scopeType, scopeId };
}

async function authorize(request: Request, body?: unknown) {
  const context = await getRequestContext(request, body);

  if (!context.userId) {
    return {
      error: NextResponse.json(
        { error: "Silakan login terlebih dahulu." },
        { status: 401 },
      ),
    };
  }

  if (!context.scopeType || !context.scopeId) {
    return {
      error: NextResponse.json(
        { error: "Target koneksi WhatsApp tidak valid." },
        { status: 400 },
      ),
    };
  }

  if (
    !(await canManageWhatsappScope(
      context.scopeType,
      context.scopeId,
      context.userId,
    ))
  ) {
    return {
      error: NextResponse.json(
        { error: "Tidak punya akses mengelola koneksi WhatsApp ini." },
        { status: 403 },
      ),
    };
  }

  return { context };
}

export async function GET(request: Request) {
  const result = await authorize(request);
  if ("error" in result) return result.error;

  const { scopeType, scopeId } = result.context;
  const connection = await getWhatsappGroupConnection(scopeType!, scopeId!);

  return NextResponse.json({
    connection: connection
      ? {
          connected: Boolean(connection.group_chat_id),
          pending:
            !connection.group_chat_id &&
            Boolean(
              connection.connect_code_expires_at &&
                connection.connect_code_expires_at > new Date(),
            ),
          groupChatId: connection.group_chat_id,
          groupName: connection.group_name,
          connectedAt: connection.connected_at,
          expiresAt: connection.connect_code_expires_at,
        }
      : null,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as unknown;
  const result = await authorize(request, body);
  if ("error" in result) return result.error;

  const { scopeType, scopeId, userId } = result.context;
  const scopeName = await getWhatsappScopeName(scopeType!, scopeId!);
  if (!scopeName) {
    return NextResponse.json(
      { error: "Workspace atau project tidak ditemukan." },
      { status: 404 },
    );
  }

  const code = createWhatsappConnectCode();
  await saveWhatsappConnectCode({
    scopeType: scopeType!,
    scopeId: scopeId!,
    userId,
    code,
  });

  return NextResponse.json({
    code,
    command: `/connect ${code}`,
    expiresInMinutes: 15,
  });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as unknown;
  const result = await authorize(request, body);
  if ("error" in result) return result.error;

  const { scopeType, scopeId } = result.context;
  await ensureWhatsappGroupConnectionSchema();
  await db.execute(
    `DELETE FROM whatsapp_group_connections
     WHERE scope_type = ? AND scope_id = ?`,
    [scopeType, scopeId],
  );

  return NextResponse.json({ success: true });
}

