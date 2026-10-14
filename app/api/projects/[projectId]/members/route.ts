import { NextResponse } from "next/server";
import type { DbResult, DbRow } from "@/lib/db";
import db from "@/lib/db";
import {
  ensureProjectPermissionSchema,
  type ProjectPermission,
} from "@/lib/project-permissions";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type MemberRow = DbRow & {
  id: number;
  name: string;
  email: string;
  direktorat: string | null;
  permission: ProjectPermission;
  is_owner: number;
};

type UserRow = DbRow & {
  id: number;
};

async function canManageProject(projectId: string, userId: number) {
  const [rows] = await db.query<DbRow[]>(
    `SELECT projects.id FROM projects
     INNER JOIN project_members ON project_members.project_id=projects.id AND project_members.user_id=?
     WHERE projects.id=? AND (projects.owner_id=? OR project_members.permission='Full akses') LIMIT 1`,
    [userId, projectId, userId],
  );
  return rows.length > 0;
}

async function canAccessProject(projectId: string, userId: number) {
  const [rows] = await db.query<DbRow[]>(
    `SELECT projects.id FROM projects
     INNER JOIN project_members ON project_members.project_id=projects.id AND project_members.user_id=?
     WHERE projects.id=? LIMIT 1`,
    [userId, projectId],
  );
  return rows.length > 0;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Silakan login." }, { status: 401 });
  if (!(await canAccessProject(projectId, userId))) return NextResponse.json({ error: "Tidak punya akses melihat anggota project." }, { status: 403 });
  await ensureProjectPermissionSchema();

  const [rows] = await db.query<MemberRow[]>(
    `SELECT users.id, users.name, users.email, users.direktorat, project_members.permission,
        (users.id = projects.owner_id)::int AS is_owner
     FROM project_members
     INNER JOIN projects ON projects.id = project_members.project_id
     INNER JOIN users ON users.id = project_members.user_id
     WHERE project_members.project_id = ?
     ORDER BY project_members.id ASC`,
    [projectId],
  );

  return NextResponse.json({
    members: rows.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      direktorat: member.direktorat ?? "",
      permission: member.permission,
      isOwner: Boolean(member.is_owner),
    })),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Silakan login." }, { status: 401 });
  if (!(await canManageProject(projectId, userId))) return NextResponse.json({ error: "Tidak punya akses mengelola anggota project." }, { status: 403 });
  await ensureProjectPermissionSchema();
  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const permission = String(body.permission ?? "Collaborator");

  if (!email) {
    return NextResponse.json(
      { error: "Email user wajib diisi." },
      { status: 400 },
    );
  }

  if (!["Full akses", "Manage", "Collaborator"].includes(permission)) {
    return NextResponse.json(
      { error: "Permission tidak valid." },
      { status: 400 },
    );
  }

  const [users] = await db.query<UserRow[]>(
    `SELECT id FROM users WHERE email = ? LIMIT 1`,
    [email],
  );

  const user = users[0];

  if (!user) {
    return NextResponse.json(
      { error: "User dengan email itu tidak ditemukan." },
      { status: 404 },
    );
  }

  await db.execute<DbResult>(
    `INSERT INTO project_members (project_id, user_id, permission)
     VALUES (?, ?, ?)
     ON CONFLICT (project_id, user_id) DO UPDATE SET permission = EXCLUDED.permission`,
    [projectId, user.id, permission],
  );

  return NextResponse.json({
    member: {
      userId: user.id,
      projectId: Number(projectId),
      permission,
    },
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const userId = await getSessionUserId();
  const body = await request.json();
  const memberId = Number(body.userId ?? 0);
  if (!userId) return NextResponse.json({ error: "Silakan login." }, { status: 401 });
  if (!Number.isSafeInteger(memberId) || memberId < 1) return NextResponse.json({ error: "Anggota tidak valid." }, { status: 400 });
  if (!(await canManageProject(projectId, userId))) return NextResponse.json({ error: "Tidak punya akses menghapus anggota project." }, { status: 403 });
  const [projects] = await db.query<DbRow[]>("SELECT owner_id FROM projects WHERE id=?", [projectId]);
  if (!projects.length) return NextResponse.json({ error: "Project tidak ditemukan." }, { status: 404 });
  if (Number(projects[0].owner_id) === memberId) return NextResponse.json({ error: "Pemilik project tidak dapat dihapus." }, { status: 400 });
  const [result] = await db.execute<DbResult>("DELETE FROM project_members WHERE project_id=? AND user_id=?", [projectId, memberId]);
  if (!result.affectedRows) return NextResponse.json({ error: "Anggota project tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ success: true });
}
