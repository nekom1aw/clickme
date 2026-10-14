import db from "@/lib/db";
import type { DbRow } from "@/lib/db";
export class WorkspaceDeleteError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function deleteWorkspace(id: number, userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new WorkspaceDeleteError("Silakan login.", 401);
  if (!Number.isSafeInteger(id) || id < 1) throw new WorkspaceDeleteError("Workspace tidak valid.", 400);
  const c = await db.getConnection();
  const locks: string[] = [];
  try {
    for (const key of ["clickme:data-request-import", "clickme:sheet-notifications"]) {
      const [rows] = await c.query<DbRow[]>("SELECT pg_try_advisory_lock(hashtext(?)) acquired", [key]);
      if (!rows[0]?.acquired) throw new WorkspaceDeleteError("Sinkronisasi sedang berjalan. Coba hapus kembali sebentar lagi.", 409);
      locks.push(key);
    }
    await c.beginTransaction();
    const [rows] = await c.query<DbRow[]>("SELECT owner_id FROM workspaces WHERE id=? FOR UPDATE", [id]);
    if (!rows.length) throw new WorkspaceDeleteError("Workspace tidak ditemukan.", 404);
    if (Number(rows[0].owner_id) !== userId) throw new WorkspaceDeleteError("Hanya pemilik workspace yang dapat menghapusnya.", 403);
    const [tables] = await c.query<DbRow[]>("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema()");
    const exists = new Set(tables.map(t => t.name));
    for (const table of ["task_activities", "task_assignees", "task_attachments", "task_tags", "data_request_public_access", "sheet_notification_queue", "sheet_notification_deliveries"]) {
      if (exists.has(table)) await c.query(`DELETE FROM ${table} d USING tasks t, projects p WHERE t.id=d.task_id AND p.id=t.project_id AND p.workspace_id=?`, [id]);
    }
    // Forms and their submitted answers remain available to their owner; detach removed task destinations.
    if (exists.has("native_form_responses")) await c.query("UPDATE native_form_responses r SET task_id=NULL FROM tasks t, projects p WHERE t.id=r.task_id AND p.id=t.project_id AND p.workspace_id=?", [id]);
    if (exists.has("native_forms")) await c.query("UPDATE native_forms SET workspace_id=NULL,project_id=NULL WHERE workspace_id=? OR project_id IN (SELECT id FROM projects WHERE workspace_id=?)", [id,id]);
    if (exists.has("whatsapp_group_connections")) await c.query("DELETE FROM whatsapp_group_connections WHERE (scope_type='workspace' AND scope_id=?) OR (scope_type='project' AND scope_id IN (SELECT id FROM projects WHERE workspace_id=?))", [id,id]);
    await c.query("DELETE FROM tasks t USING projects p WHERE p.id=t.project_id AND p.workspace_id=?", [id]);
    for (const table of ["project_members", "project_statuses"]) if (exists.has(table)) await c.query(`DELETE FROM ${table} d USING projects p WHERE p.id=d.project_id AND p.workspace_id=?`, [id]);
    for (const table of ["data_request_import_rows", "data_request_import_sources", "sheet_source_settings", "workspace_invitations", "workspace_members", "workspace_pins", "workspace_tags"]) {
      if (exists.has(table)) await c.query(`DELETE FROM ${table} WHERE workspace_id=?`, [id]);
    }
    await c.execute("DELETE FROM projects WHERE workspace_id=?", [id]);
    await c.execute("DELETE FROM workspaces WHERE id=?", [id]);
    await c.commit();
  } catch (error) { await c.rollback(); throw error; }
  finally { for (const key of locks) await c.query("SELECT pg_advisory_unlock(hashtext(?))", [key]); c.release(); }
}
