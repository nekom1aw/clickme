import { createHash } from "node:crypto";
import type { DataRequestRow } from "@/lib/data-request-import";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { googleSheetCsvUrl, readSpreadsheet } from "@/lib/data-request-import";
import type { SheetSettings } from "@/lib/sheet-mapping";

let schema: Promise<void> | undefined;
export function ensureSheetSourceSchema() {
  return schema ??= (async () => {
    await db.execute(`CREATE TABLE IF NOT EXISTS data_request_import_sources (
      workspace_id integer PRIMARY KEY, google_sheet_url text NOT NULL, last_synced_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS sheet_source_settings (
      workspace_id integer PRIMARY KEY, source_url text NOT NULL, settings_json text NOT NULL,
      version varchar(64) NOT NULL, initial_pending smallint NOT NULL DEFAULT 1,
      paused smallint NOT NULL DEFAULT 0, last_error text NULL
    )`);
  })().catch(error => { schema = undefined; throw error; });
}
export function canonicalSheetUrl(input: string) {
  const value = /^[a-zA-Z0-9_-]{20,}$/.test(input.trim()) ? `https://docs.google.com/spreadsheets/d/${input.trim()}/edit?gid=0` : input.trim();
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !/^\/spreadsheets\/d\/[a-zA-Z0-9_-]+\//.test(url.pathname)) throw new Error("Masukkan URL atau ID Google Sheets yang valid.");
  return googleSheetCsvUrl(value);
}
export async function inspectSheet(input: string) {
  const url = canonicalSheetUrl(input);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok || response.headers.get("content-type")?.includes("text/html")) throw new Error("Sheet belum dapat dibaca oleh server. Periksa akses sumber jawaban.");
  return { url, ...readSpreadsheet(await response.text()) };
}
export type SourceSettingsRow = DbRow & { source_url: string; settings_json: string; version: string; initial_pending: number; paused: number; last_error: string | null };
export async function loadSourceSettings(workspaceId: number) {
  await ensureSheetSourceSchema();
  const [rows] = await db.query<SourceSettingsRow[]>("SELECT * FROM sheet_source_settings WHERE workspace_id = ?", [workspaceId]);
  return rows[0] ? { ...rows[0], settings: JSON.parse(rows[0].settings_json) as SheetSettings } : null;
}

export function mappedIdentity(raw: DataRequestRow, settings: SheetSettings, sourceId: string) {
  const identity = settings.mapping.responseId
    ? raw[settings.mapping.responseId]?.trim()
    : JSON.stringify([raw[settings.mapping.timestamp!]?.trim(), raw[settings.mapping.email || ""]?.trim() || raw[settings.mapping.name || ""]?.trim() || ""]);
  if (settings.mapping.responseId ? !identity : !raw[settings.mapping.timestamp!]?.trim()) throw new Error("Ada jawaban tanpa ID atau waktu jawaban. Lengkapi identitas sebelum sinkronisasi.");
  return createHash("sha256").update(`${sourceId}|${identity}`).digest("hex");
}
