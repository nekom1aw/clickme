import { inviteWorkspace, removeWorkspaceMember, ensureInvitations, InvitationError } from "@/lib/workspace-invitations";
import { NextResponse } from "next/server";
import type { DbResult, DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureProjectPermissionSchema } from "@/lib/project-permissions";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type WorkspaceMemberRow = DbRow & {
  id: number;
  name: string;
  email: string;
  direktorat: string | null;
  role: "owner" | "administrator" | "manager" | "collaborator";
};

type ProjectAssignmentRow = DbRow & {
  user_id: number;
  project_id: number;
  project_name: string;
};

type AccessRow = DbRow & {
  id: number;
};

const roles = ["administrator", "manager", "collaborator"] as const;

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

function projectPermissionForRole(role: (typeof roles)[number]) {
  if (role === "collaborator") {
    return "Collaborator";
  }

  return role === "manager" ? "Manage" : "Full akses";
}

async function saveProjectAssignments(
  workspaceId: string,
  userId: number,
  role: (typeof roles)[number],
  projectIds: number[],
) {
  await ensureProjectPermissionSchema();
  const uniqueProjectIds = [...new Set(projectIds.filter(Boolean))];

  await db.execute(
    // Keep rows for projects the user owns, or they'd be locked out of their own project.
    `DELETE FROM project_members
     USING projects
     WHERE projects.id = project_members.project_id
       AND projects.workspace_id = ? AND project_members.user_id = ?
       AND projects.owner_id IS DISTINCT FROM project_members.user_id`,
    [workspaceId, userId],
  );

  if (!uniqueProjectIds.length) {
    return;
  }

  const [projects] = await db.query<Array<DbRow & { id: number }>>(
    `SELECT id
     FROM projects
     WHERE workspace_id = ? AND id IN (${uniqueProjectIds.map(() => "?").join(",")})`,
    [workspaceId, ...uniqueProjectIds],
  );

  const permission = projectPermissionForRole(role);

  for (const project of projects) {
    await db.execute<DbResult>(
      `INSERT INTO project_members (project_id, user_id, permission)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id, user_id) DO UPDATE SET permission = EXCLUDED.permission
       WHERE NOT EXISTS (
         SELECT 1 FROM projects
         WHERE projects.id = project_members.project_id
           AND projects.owner_id = project_members.user_id
       )`,
      [project.id, userId, permission],
    );
  }
}

async function canManageWorkspace(workspaceId: string, userId: number) {
  const [rows] = await db.query<AccessRow[]>(
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

  return Boolean(rows[0]);
}

async function canViewWorkspace(workspaceId: string, userId: number) {
  const [rows] = await db.query<AccessRow[]>(
    `SELECT workspaces.id
     FROM workspaces
     LEFT JOIN workspace_members ON workspace_members.workspace_id = workspaces.id
       AND workspace_members.user_id = ?
     WHERE workspaces.id = ?
       AND (workspaces.owner_id = ? OR workspace_members.user_id IS NOT NULL)
     LIMIT 1`,
    [userId, workspaceId, userId],
  );

  return Boolean(rows[0]);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const userId = await getSessionUserId();

  if (!userId) {
    return NextResponse.json({ members: [] }, { status: 401 });
  }

  await ensureWorkspaceMembersTable();

  if (!(await canViewWorkspace(workspaceId, userId))) {
    return NextResponse.json({ members: [] }, { status: 403 });
  }

  const canManage = await canManageWorkspace(workspaceId, userId);

  const [members] = await db.query<WorkspaceMemberRow[]>(
    `SELECT * FROM (
     SELECT users.id, users.name, users.email, users.direktorat, 'owner' AS role
     FROM workspaces
     INNER JOIN users ON users.id = workspaces.owner_id
     WHERE workspaces.id = ?

     UNION ALL

     SELECT users.id, users.name, users.email, users.direktorat, workspace_members.role
     FROM workspace_members
     INNER JOIN users ON users.id = workspace_members.user_id
     INNER JOIN workspaces ON workspaces.id = workspace_members.workspace_id
     WHERE workspace_members.workspace_id = ?
       AND workspace_members.user_id <> workspaces.owner_id
     ) members

     ORDER BY COALESCE(array_position(ARRAY['owner', 'administrator', 'manager', 'collaborator']::text[], role::text), 0), name ASC`,
    [workspaceId, workspaceId],
  );
  const [projectAssignments] = await db.query<ProjectAssignmentRow[]>(
    `SELECT project_members.user_id, projects.id AS project_id, projects.name AS project_name
     FROM project_members
     INNER JOIN projects ON projects.id = project_members.project_id
     WHERE projects.workspace_id = ?
     ORDER BY projects.name ASC`,
    [workspaceId],
  );

  await ensureInvitations();
  const [invitations] = canManage ? await db.query<DbRow[]>("SELECT id,email,role,created_at FROM workspace_invitations WHERE workspace_id=? AND status='pending' ORDER BY created_at DESC",[workspaceId]) : [[]];
  return NextResponse.json({
    invitations,
    canManage,
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      direktorat: member.direktorat ?? "",
      role: member.role,
      isOwner: member.role === "owner",
      projects: projectAssignments
        .filter((project) => project.user_id === member.id)
        .map((project) => ({
          id: project.project_id,
          name: project.project_name,
        })),
    })),
  });
}

export async function POST(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  const actor=await getSessionUserId();
  const {workspaceId}=await context.params;
  const body=await request.json();
  try {
    const result=await inviteWorkspace(Number(workspaceId),actor,String(body.email??"").trim().toLowerCase(),String(body.role??"collaborator"),Array.isArray(body.projectIds)?body.projectIds.map(Number):[]);
    return NextResponse.json({invited:true,...result},{status:201});
  } catch(error) { if(error instanceof InvitationError)return NextResponse.json({error:error.message},{status:error.status});throw error; }
}
export async function DELETE(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  const actor=await getSessionUserId();
  const {workspaceId}=await context.params;const body=await request.json();
  try {await removeWorkspaceMember(Number(workspaceId),actor,Number(body.userId));return NextResponse.json({success:true});}
  catch(error){if(error instanceof InvitationError)return NextResponse.json({error:error.message},{status:error.status});throw error;}
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const currentUserId = await getSessionUserId();
  const body = await request.json();
  const userId = Number(body.userId ?? 0);
  const role = String(body.role ?? "collaborator") as (typeof roles)[number];
  const projectIds = Array.isArray(body.projectIds)
    ? body.projectIds.map((projectId: unknown) => Number(projectId))
    : [];

  if (!currentUserId) {
    return NextResponse.json(
      { error: "Silakan login terlebih dahulu." },
      { status: 401 },
    );
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Member tidak ditemukan." },
      { status: 400 },
    );
  }

  if (!roles.includes(role)) {
    return NextResponse.json({ error: "Role tidak valid." }, { status: 400 });
  }

  await ensureWorkspaceMembersTable();

  if (!(await canManageWorkspace(workspaceId, currentUserId))) {
    return NextResponse.json(
      { error: "Tidak punya akses mengelola workspace ini." },
      { status: 403 },
    );
  }

  const [ownerRows] = await db.query<Array<DbRow & { owner_id: number }>>(
    `SELECT owner_id FROM workspaces WHERE id = ? LIMIT 1`,
    [workspaceId],
  );

  if (Number(ownerRows[0]?.owner_id) === userId) {
    return NextResponse.json(
      { error: "Role owner tidak dapat diubah." },
      { status: 400 },
    );
  }

  const [existingMembers] = await db.query<DbRow[]>(
    "SELECT user_id FROM workspace_members WHERE workspace_id=? AND user_id=?", [workspaceId, userId],
  );
  if (!existingMembers.length) return NextResponse.json({error: "User belum menjadi anggota. Kirim undangan terlebih dahulu."}, {status: 409});

  await db.execute<DbResult>(
    `UPDATE workspace_members
     SET role = ?
     WHERE workspace_id = ? AND user_id = ?`,
    [role, workspaceId, userId],
  );
  await saveProjectAssignments(workspaceId, userId, role, projectIds);

  return NextResponse.json({
    member: {
      id: userId,
      role,
      projectIds,
    },
  });
}
