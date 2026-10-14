import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { canManageWhatsappScope } from "@/lib/whatsapp-group-connections";
import { randomUUID } from "node:crypto";
import { ensureSheetSourceSchema, inspectSheet, loadSourceSettings, canonicalSheetUrl, mappedIdentity } from "@/lib/sheet-source";
import { suggestSettings, validateSettings, renderSheetMessage } from "@/lib/sheet-mapping";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ workspaceId: string }> };

async function authorize(context: Context) {
  const id = Number((await context.params).workspaceId);
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Silakan login terlebih dahulu." }, { status: 401 });
  if (!Number.isInteger(id) || id < 1 || !(await canManageWhatsappScope("workspace", id, userId))) {
    return NextResponse.json({ error: "Tidak punya akses mengelola workspace ini." }, { status: 403 });
  }
  await ensureSheetSourceSchema();
  return id;
}

export async function GET(_request: Request, context: Context) {
  const id = await authorize(context);
  if (id instanceof Response) return id;
  const [rows] = await db.query<DbRow[]>("SELECT google_sheet_url, last_synced_at FROM data_request_import_sources WHERE workspace_id = ?", [id]);
  const saved = await loadSourceSettings(id);
  return NextResponse.json({ googleSheetUrl: rows[0]?.google_sheet_url ?? "", lastSyncedAt: rows[0]?.last_synced_at ?? null, settings: saved?.settings ?? null, paused: Boolean(saved?.paused), lastError: saved?.last_error ?? null, initialPending: Boolean(saved?.initial_pending) });
}

export async function POST(request: Request, context: Context) {
  const id = await authorize(context);
  if (id instanceof Response) return id;
  try {
    const body = await request.json();
    const sheet = await inspectSheet(String(body.googleSheetUrl ?? ""));
    const saved = await loadSourceSettings(id);
    const settings = body.settings ? validateSettings(body.settings, sheet.headers) : saved && canonicalSheetUrl(saved.source_url) === sheet.url ? saved.settings : suggestSettings(sheet.headers);
    const sample = sheet.rows.find(row => row[settings.mapping.title || ""]?.trim()) ?? {};
    return NextResponse.json({ headers: sheet.headers, settings, sample, preview: renderSheetMessage(settings.template, sample, settings), rowCount: sheet.rows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sheet tidak dapat dibaca." }, { status: 400 });
  }
}

export async function PUT(request: Request, context: Context) {
  const id = await authorize(context);
  if (id instanceof Response) return id;
  try {
    const body = await request.json();
    const sheet = await inspectSheet(String(body.googleSheetUrl ?? ""));
    const settings = validateSettings(body.settings, sheet.headers);
    const identities = new Set<string>();
    for (const row of sheet.rows.filter(row => row[settings.mapping.title!]?.trim())) {
      const identity = mappedIdentity(row, settings, sheet.url);
      if (identities.has(identity)) throw new Error("Identitas jawaban duplikat. Pilih kolom ID yang unik untuk setiap jawaban.");
      identities.add(identity);
    }
    const connection = await db.getConnection();
    try {
      const [locks] = await connection.query<DbRow[]>("SELECT pg_try_advisory_lock(hashtext('clickme:data-request-import')) AS acquired");
      if (!locks[0]?.acquired) return NextResponse.json({ error: "Sinkronisasi sedang berjalan. Coba simpan kembali sebentar lagi." }, { status: 409 });
      await connection.beginTransaction();
      const [existing] = await connection.query<DbRow[]>("SELECT google_sheet_url, last_synced_at FROM data_request_import_sources WHERE workspace_id = ?", [id]);
      const unchanged = existing[0] && canonicalSheetUrl(existing[0].google_sheet_url) === sheet.url;
      const old = await loadSourceSettings(id);
      const initialPending = unchanged ? old?.initial_pending ?? (existing[0].last_synced_at ? 0 : 1) : 1;
      await connection.execute(`INSERT INTO data_request_import_sources (workspace_id, google_sheet_url) VALUES (?, ?)
        ON CONFLICT (workspace_id) DO UPDATE SET last_synced_at = CASE WHEN ?::boolean THEN data_request_import_sources.last_synced_at ELSE NULL END, google_sheet_url = EXCLUDED.google_sheet_url`, [id, sheet.url, Boolean(unchanged)]);
      await connection.execute(`INSERT INTO sheet_source_settings (workspace_id,source_url,settings_json,version,initial_pending) VALUES (?,?,?,?,?)
        ON CONFLICT (workspace_id) DO UPDATE SET source_url=EXCLUDED.source_url,settings_json=EXCLUDED.settings_json,version=EXCLUDED.version,initial_pending=EXCLUDED.initial_pending,paused=0,last_error=NULL`, [id,sheet.url,JSON.stringify(settings),randomUUID(),initialPending]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { await connection.query("SELECT pg_advisory_unlock(hashtext('clickme:data-request-import'))"); connection.release(); }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pengaturan tidak valid." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const id = await authorize(context);
  if (id instanceof Response) return id;
  const connection = await db.getConnection();
  try {
    const [locks] = await connection.query<DbRow[]>("SELECT pg_try_advisory_lock(hashtext('clickme:data-request-import')) AS acquired");
    if (!locks[0]?.acquired) return NextResponse.json({ error: "Sinkronisasi sedang berjalan. Coba kembali." }, { status: 409 });
    await connection.beginTransaction();
    await connection.execute("DELETE FROM sheet_source_settings WHERE workspace_id = ?", [id]);
    await connection.execute("DELETE FROM data_request_import_sources WHERE workspace_id = ?", [id]);
    await connection.commit();
    return NextResponse.json({ success: true });
  } catch (error) { await connection.rollback(); throw error; }
  finally { await connection.query("SELECT pg_advisory_unlock(hashtext('clickme:data-request-import'))"); connection.release(); }
}
