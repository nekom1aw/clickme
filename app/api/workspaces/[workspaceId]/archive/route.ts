import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureWorkspaceArchiveColumn } from "@/lib/workspace-schema";
import { getSessionUserId } from "@/lib/session";
export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const userId = await getSessionUserId();
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Silakan login." }, { status: 401 });
  const id = Number((await params).workspaceId);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Workspace tidak valid." }, { status: 400 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Data tidak valid." }, { status: 400 }); }
  if (typeof body?.isArchived !== "boolean") return Response.json({ error: "Status tidak valid." }, { status: 400 });
  const [rows] = await db.query<DbRow[]>(`SELECT w.id FROM workspaces w LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=? WHERE w.id=? AND (w.owner_id=? OR m.role='administrator')`, [userId, id, userId]);
  if (!rows.length) return Response.json({ error: "Hanya pemilik atau administrator workspace yang dapat mengarsipkan." }, { status: 403 });
  await ensureWorkspaceArchiveColumn();
  await db.execute("UPDATE workspaces SET is_archived=? WHERE id=?", [body.isArchived ? 1 : 0, id]);
  return Response.json({ isArchived: body.isArchived });
}
