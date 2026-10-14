import { NextResponse } from "next/server";
import type { DbResult, DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureProjectPublishingColumn } from "@/lib/project-schema";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type ProjectAccessRow = DbRow & {
  id: number;
};

type ProjectRow = DbRow & {
  id: number;
  name: string;
  description: string | null;
  publish_override: 0 | 1 | null;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const userId = await getSessionUserId();
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const publishMode = String(body.publishMode ?? "inherit");

  if (!userId) {
    return NextResponse.json(
      { error: "Silakan login terlebih dahulu." },
      { status: 401 },
    );
  }

  if (!name) {
    return NextResponse.json(
      { error: "Project name wajib diisi." },
      { status: 400 },
    );
  }

  if (!["inherit", "published", "hidden"].includes(publishMode)) {
    return NextResponse.json(
      { error: "Pilihan publikasi tidak valid." },
      { status: 400 },
    );
  }

  await ensureProjectPublishingColumn();

  const [accessRows] = await db.query<ProjectAccessRow[]>(
    `SELECT projects.id
     FROM projects
     INNER JOIN project_members ON project_members.project_id = projects.id
       AND project_members.user_id = ?
     WHERE projects.id = ?
       AND (projects.owner_id = ? OR project_members.permission = 'Full akses')
     LIMIT 1`,
    [userId, projectId, userId],
  );

  if (!accessRows[0]) {
    return NextResponse.json(
      { error: "Tidak punya akses mengubah project ini." },
      { status: 403 },
    );
  }

  const publishOverride =
    publishMode === "inherit" ? null : publishMode === "published" ? 1 : 0;

  await db.execute<DbResult>(
    `UPDATE projects
     SET name = ?, description = ?, publish_override = ?
     WHERE id = ?`,
    [name, description, publishOverride, projectId],
  );

  const [projectRows] = await db.query<ProjectRow[]>(
    `SELECT id, name, description, publish_override
     FROM projects
     WHERE id = ?
     LIMIT 1`,
    [projectId],
  );
  const project = projectRows[0];

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description ?? "",
      publishMode:
        project.publish_override === null
          ? "inherit"
          : project.publish_override
            ? "published"
            : "hidden",
    },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Silakan login." }, { status: 401 });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [projects] = await connection.query<DbRow[]>("SELECT owner_id FROM projects WHERE id=? FOR UPDATE", [projectId]);
    if (!projects.length) {
      await connection.rollback();
      return NextResponse.json({ error: "Project tidak ditemukan." }, { status: 404 });
    }
    if (Number(projects[0].owner_id) !== userId) {
      await connection.rollback();
      return NextResponse.json({ error: "Hanya pemilik project yang dapat menghapusnya." }, { status: 403 });
    }
    const [tables] = await connection.query<DbRow[]>("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema()");
    const exists = new Set(tables.map((table) => table.name));
    for (const table of ["task_activities", "task_assignees", "task_attachments", "task_tags", "data_request_public_access", "sheet_notification_queue", "sheet_notification_deliveries"]) {
      if (exists.has(table)) await connection.query(`DELETE FROM ${table} child USING tasks WHERE tasks.id=child.task_id AND tasks.project_id=?`, [projectId]);
    }
    if (exists.has("native_form_responses")) await connection.query("UPDATE native_form_responses responses SET task_id=NULL FROM tasks WHERE tasks.id=responses.task_id AND tasks.project_id=?", [projectId]);
    if (exists.has("native_forms")) await connection.query("UPDATE native_forms SET project_id=NULL WHERE project_id=?", [projectId]);
    if (exists.has("data_request_import_rows")) await connection.query("DELETE FROM data_request_import_rows WHERE project_id=?", [projectId]);
    if (exists.has("whatsapp_group_connections")) await connection.query("DELETE FROM whatsapp_group_connections WHERE scope_type='project' AND scope_id=?", [projectId]);
    await connection.execute("DELETE FROM tasks WHERE project_id=?", [projectId]);
    await connection.execute("DELETE FROM project_members WHERE project_id=?", [projectId]);
    await connection.execute("DELETE FROM project_statuses WHERE project_id=?", [projectId]);
    await connection.execute("DELETE FROM projects WHERE id=?", [projectId]);
    await connection.commit();
    return NextResponse.json({ success: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
