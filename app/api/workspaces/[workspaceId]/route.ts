import { deleteWorkspace, WorkspaceDeleteError } from "@/lib/delete-workspace";
import { NextResponse } from "next/server";
import type { DbResult, DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureWorkspacePublishingColumn } from "@/lib/workspace-schema";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type WorkspaceAccessRow = DbRow & {
  id: number;
};

type WorkspaceRow = DbRow & {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  is_published: 0 | 1;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const userId = await getSessionUserId();
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const isPublished = Boolean(body.isPublished);

  if (!userId) {
    return NextResponse.json(
      { error: "Silakan login terlebih dahulu." },
      { status: 401 },
    );
  }

  if (!name) {
    return NextResponse.json(
      { error: "Workspace name wajib diisi." },
      { status: 400 },
    );
  }

  await ensureWorkspacePublishingColumn();

  const [accessRows] = await db.query<WorkspaceAccessRow[]>(
    `SELECT workspaces.id
     FROM workspaces
     LEFT JOIN workspace_members ON workspace_members.workspace_id = workspaces.id
       AND workspace_members.user_id = ?
     WHERE workspaces.id = ?
       AND (
         workspaces.owner_id = ?
         OR workspace_members.role = 'administrator'
       )
     LIMIT 1`,
    [userId, workspaceId, userId],
  );

  if (!accessRows[0]) {
    return NextResponse.json(
      { error: "Tidak punya akses mengubah workspace ini." },
      { status: 403 },
    );
  }

  await db.execute<DbResult>(
    `UPDATE workspaces
     SET name = ?, description = ?, is_published = ?
     WHERE id = ?`,
    [name, description, isPublished ? 1 : 0, workspaceId],
  );

  const [workspaceRows] = await db.query<WorkspaceRow[]>(
    `SELECT id, name, description, slug, is_published
     FROM workspaces
     WHERE id = ?
     LIMIT 1`,
    [workspaceId],
  );
  const workspace = workspaceRows[0];

  return NextResponse.json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description ?? "",
      slug: workspace.slug,
      isPublished: Boolean(workspace.is_published),
    },
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const userId = await getSessionUserId();
  try {
    await deleteWorkspace(Number((await context.params).workspaceId), userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof WorkspaceDeleteError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Workspace gagal dihapus. Silakan coba kembali." }, { status: 500 });
  }
}
