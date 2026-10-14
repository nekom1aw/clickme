import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureDataRequestMonitoringSchema } from "@/lib/data-request-monitoring";
import { ensureImportSchema, importDataRequests, type DataRequestImportInput } from "@/lib/data-request-sync";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
async function currentUserId() {
  return await getSessionUserId();
}

export async function GET(request: Request) {
  const userId = await currentUserId();

  if (!userId) {
    return NextResponse.json(
      { error: "Silakan login terlebih dahulu." },
      { status: 401 },
    );
  }

  await ensureImportSchema();
  await ensureDataRequestMonitoringSchema();

  const workspaceName =
    new URL(request.url).searchParams.get("workspaceName")?.trim() ||
    "Permintaan Data";
  const [rows] = await db.query<DbRow[]>(
    `SELECT workspaces.id AS workspace_id,
        data_request_import_sources.google_sheet_url,
        data_request_import_sources.last_synced_at
     FROM workspaces
     LEFT JOIN workspace_members
       ON workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = ?
     LEFT JOIN data_request_import_sources
       ON data_request_import_sources.workspace_id = workspaces.id
     WHERE LOWER(workspaces.name) = LOWER(?)
       AND (
         workspaces.owner_id = ?
         OR workspace_members.role IN ('administrator', 'manager')
       )
     ORDER BY (workspaces.owner_id = ?) DESC NULLS LAST, workspaces.id ASC
     LIMIT 1`,
    [userId, workspaceName, userId, userId],
  );
  const workspaceId = Number(rows[0]?.workspace_id ?? 0);
  const [monitoringRows] = workspaceId
    ? await db.query<DbRow[]>(
        `SELECT tasks.id AS task_id,
            tasks.name AS task_name,
            data_request_public_access.requester_name,
            data_request_public_access.requester_email,
            data_request_public_access.public_token
         FROM data_request_public_access
         INNER JOIN tasks
           ON tasks.id = data_request_public_access.task_id
         INNER JOIN projects
           ON projects.id = tasks.project_id
         WHERE projects.workspace_id = ?
         ORDER BY tasks.created_at DESC, tasks.id DESC`,
        [workspaceId],
      )
    : [[]];

  return NextResponse.json({
    workspaceId: workspaceId || null,
    googleSheetUrl: String(rows[0]?.google_sheet_url ?? ""),
    lastSyncedAt: rows[0]?.last_synced_at ?? null,
    monitoringLinks: monitoringRows.map((row) => ({
      taskId: Number(row.task_id),
      taskName: String(row.task_name ?? "Permintaan data"),
      requesterName: String(row.requester_name ?? "Pemohon"),
      requesterEmail: String(row.requester_email ?? ""),
      path: `/monitoring/${String(row.public_token)}`,
    })),
  });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Silakan login terlebih dahulu." }, { status: 401 });
  return importDataRequests(userId, await request.json() as DataRequestImportInput);
}
