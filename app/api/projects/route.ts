import { ensureWorkspacePins } from "@/lib/workspace-pins";
import { NextResponse } from "next/server";
import type { DbResult, DbRow } from "@/lib/db";
import { randomBytes } from "crypto";
import db from "@/lib/db";
import { ensureProjectPublishingColumn } from "@/lib/project-schema";
import { ensureWorkspaceArchiveColumn, ensureWorkspacePublishingColumn } from "@/lib/workspace-schema";
import {
  ensureProjectPermissionSchema,
  type ProjectPermission,
} from "@/lib/project-permissions";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type ProjectRow = DbRow & {
  id: number;
  workspace_id: number;
  slug: string;
  view_slug: string;
  name: string;
  description: string | null;
  permission: ProjectPermission;
  is_private: 0 | 1;
  is_pinned: 0 | 1;
  publish_override: 0 | 1 | null;
  is_owner: number;
};

type WorkspaceRow = DbRow & {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  is_published: 0 | 1;
  is_archived: 0 | 1;
};

type WorkspaceResponse = {
  isArchived: boolean;
  isPinned: boolean;
  id: number;
  name: string;
  description: string;
  slug: string;
  isPublished: boolean;
  projects: Array<{
    id: number;
    slug: string;
    viewSlug: string;
    name: string;
    description: string;
    permission: string;
    isOwner: boolean;
    isPrivate: boolean;
    isPinned: boolean;
    publishMode: "inherit" | "published" | "hidden";
  }>;
};

async function ensureWorkspaceMembersTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id integer NOT NULL,
      user_id integer NOT NULL,
      role varchar(20) NOT NULL DEFAULT 'collaborator' CHECK (role IN ('administrator', 'manager', 'collaborator')),
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, user_id)
    )
  `);
}

export async function GET() {
  const userId = await getSessionUserId() || null;

  if (!userId) {
    return NextResponse.json({ workspaces: [], projects: [] }, { status: 401 });
  }

  await ensureWorkspaceMembersTable();
  await ensureProjectPermissionSchema();
  await ensureWorkspacePublishingColumn();
  await ensureWorkspaceArchiveColumn();
  await ensureProjectPublishingColumn();

  const [workspaceRows] = await db.query<WorkspaceRow[]>(
    `SELECT DISTINCT workspaces.id, workspaces.name, workspaces.description,
        workspaces.slug, workspaces.is_published, workspaces.is_archived, workspaces.created_at
     FROM workspaces
     LEFT JOIN workspace_members ON workspace_members.workspace_id = workspaces.id
     LEFT JOIN projects ON projects.workspace_id = workspaces.id
     LEFT JOIN project_members ON project_members.project_id = projects.id
       AND project_members.user_id = ?
     WHERE workspaces.owner_id = ?
       OR workspace_members.user_id = ?
       OR project_members.user_id = ?
     ORDER BY workspaces.created_at ASC, workspaces.id ASC`,
    [userId, userId, userId, userId],
  );
  const [rows] = await db.query<ProjectRow[]>(
    `SELECT projects.id, projects.workspace_id,
        projects.slug, projects.view_slug, projects.name, projects.description, project_members.permission,
        projects.is_private, project_members.is_pinned, projects.publish_override,
        (projects.owner_id = ?)::int AS is_owner
     FROM projects
     INNER JOIN project_members ON project_members.project_id = projects.id
     INNER JOIN workspaces ON workspaces.id = projects.workspace_id
     LEFT JOIN workspace_members ON workspace_members.workspace_id = workspaces.id
       AND workspace_members.user_id = ?
     WHERE project_members.user_id = ?
       AND (
         workspaces.owner_id = ?
         OR workspace_members.role IN ('administrator', 'manager')
         OR project_members.user_id = ?
       )
     ORDER BY project_members.is_pinned DESC, projects.created_at DESC, projects.id DESC`,
    [userId, userId, userId, userId, userId],
  );

  await ensureWorkspacePins();
  const [pins] = await db.query<DbRow[]>("SELECT workspace_id FROM workspace_pins WHERE user_id=?", [userId]);
  const pinnedIds = new Set(pins.map(pin => Number(pin.workspace_id)));
  const workspaces = workspaceRows.map<WorkspaceResponse>((workspace) => ({
    id: workspace.id,
    isArchived: Boolean(workspace.is_archived),
    isPinned: pinnedIds.has(Number(workspace.id)),
    name: workspace.name,
    description: workspace.description ?? "",
    slug: workspace.slug,
    isPublished: Boolean(workspace.is_published),
    projects: [],
  }));

  rows.forEach((project) => {
    const workspace = workspaces.find(
      (currentWorkspace) => currentWorkspace.id === project.workspace_id,
    );

    if (!workspace) {
      return;
    }

    workspace.projects.push({
      id: project.id,
      slug: project.slug,
      viewSlug: project.view_slug,
      name: project.name,
      description: project.description ?? "",
      permission: project.permission,
      isOwner: Boolean(project.is_owner),
      isPrivate: Boolean(project.is_private),
      isPinned: Boolean(project.is_pinned),
      publishMode:
        project.publish_override === null
          ? "inherit"
          : project.publish_override
            ? "published"
            : "hidden",
    });
  });

  return NextResponse.json({
    workspaces,
    projects: rows.map((project) => ({
      id: project.id,
      slug: project.slug,
      viewSlug: project.view_slug,
      name: project.name,
      description: project.description ?? "",
      permission: project.permission,
      isOwner: Boolean(project.is_owner),
      isPrivate: Boolean(project.is_private),
      isPinned: Boolean(project.is_pinned),
      publishMode:
        project.publish_override === null
          ? "inherit"
          : project.publish_override
            ? "published"
            : "hidden",
    })),
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const ownerId = await getSessionUserId() || null;
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const slug = `${randomBytes(4).toString("hex")}-${Date.now().toString(36)}`;
  const viewSlug = `${randomBytes(4).toString("hex")}-${randomBytes(2).toString("hex")}`;
  const workspaceId = Number(body.workspaceId ?? 0);
  const permission = String(body.permission ?? "Full akses");
  const isPrivate = Boolean(body.isPrivate);

  if (!name) {
    return NextResponse.json(
      { error: "Project name is required" },
      { status: 400 },
    );
  }

  if (!ownerId) {
    return NextResponse.json(
      { error: "Silakan login terlebih dahulu." },
      { status: 401 },
    );
  }

  await ensureProjectPermissionSchema();

  if (!["Full akses", "Manage", "Collaborator"].includes(permission)) {
    return NextResponse.json(
      { error: "Invalid permission" },
      { status: 400 },
    );
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await ensureWorkspaceMembersTable();

    const [workspaces] = await connection.query<DbRow[]>(
      `SELECT workspaces.id
       FROM workspaces
       LEFT JOIN workspace_members ON workspace_members.workspace_id = workspaces.id
         AND workspace_members.user_id = ?
       WHERE workspaces.id = ?
         AND (
           workspaces.owner_id = ?
           OR workspace_members.role IN ('administrator', 'manager')
         )
       LIMIT 1`,
      [ownerId, workspaceId, ownerId],
    );

    const targetWorkspaceId = Number(workspaces[0]?.id ?? 0);

    if (!targetWorkspaceId) {
      await connection.rollback();
      return NextResponse.json(
        { error: "Workspace tidak ditemukan." },
        { status: 404 },
      );
    }

    const [result] = await connection.execute<DbResult>(
      `INSERT INTO projects (workspace_id, owner_id, slug, view_slug, name, description, permission, is_private)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        targetWorkspaceId,
        ownerId,
        slug,
        viewSlug,
        name,
        description,
        permission,
        isPrivate ? 1 : 0,
      ],
    );

    if (ownerId) {
      await connection.execute(
        `INSERT INTO project_members (project_id, user_id, permission)
         VALUES (?, ?, 'Full akses')`,
        [result.insertId, ownerId],
      );
    }

    await connection.execute(
      `INSERT INTO project_statuses (project_id, name, color, category, position, is_default)
       VALUES
         (?, 'TO DO', 'neutral', 'not_started', 1, 1),
         (?, 'IN PROGRESS', 'blue', 'active', 2, 1),
         (?, 'COMPLETE', 'green', 'closed', 3, 1)`,
      [result.insertId, result.insertId, result.insertId],
    );

    await connection.commit();

    return NextResponse.json(
      {
        project: {
          id: result.insertId,
          workspaceId: targetWorkspaceId,
          slug,
          viewSlug,
          name,
          description,
          permission,
          isPrivate,
          isPinned: false,
          publishMode: "inherit",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
