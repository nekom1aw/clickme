import db from "@/lib/db";
import type { DbRow } from "@/lib/db";
import { ensureProjectPermissionSchema } from "@/lib/project-permissions";

type ProjectAccessRow = DbRow & {
  can_manage: number;
};

type TaskAccessRow = DbRow & {
  can_manage: number;
  is_assigned: number;
};

type TaskChatAccessRow = DbRow & {
  can_chat: number;
};

export async function canManageProject(projectId: string | number, userId: number) {
  await ensureProjectPermissionSchema();
  const [rows] = await db.query<ProjectAccessRow[]>(
    `SELECT EXISTS(
       SELECT 1
       FROM projects
       INNER JOIN workspaces ON workspaces.id = projects.workspace_id
       LEFT JOIN project_members ON project_members.project_id = projects.id
         AND project_members.user_id = ?
       WHERE projects.id = ?
         AND (
           projects.owner_id = ?
           OR workspaces.owner_id = ?
           OR project_members.permission IN ('Full akses', 'Manage')
         )
     )::int AS can_manage`,
    [userId, projectId, userId, userId],
  );

  return Boolean(rows[0]?.can_manage);
}

export async function getTaskAccess(
  projectId: string | number,
  taskId: string | number,
  userId: number,
) {
  await ensureProjectPermissionSchema();
  const [rows] = await db.query<TaskAccessRow[]>(
    `SELECT
       BOOL_OR(
         projects.owner_id = ?
         OR workspaces.owner_id = ?
         OR project_members.permission IN ('Full akses', 'Manage')
       )::int AS can_manage,
       BOOL_OR(
         tasks.assignee_id = ?
         OR task_assignees.user_id IS NOT NULL
       )::int AS is_assigned
     FROM tasks
     INNER JOIN projects ON projects.id = tasks.project_id
     INNER JOIN workspaces ON workspaces.id = projects.workspace_id
     LEFT JOIN project_members ON project_members.project_id = projects.id
       AND project_members.user_id = ?
     LEFT JOIN task_assignees ON task_assignees.task_id = tasks.id
       AND task_assignees.user_id = ?
     WHERE tasks.id = ? AND tasks.project_id = ?`,
    [userId, userId, userId, userId, userId, taskId, projectId],
  );

  return {
    canManage: Boolean(rows[0]?.can_manage),
    isAssigned: Boolean(rows[0]?.is_assigned),
  };
}

export async function canAccessWorkspace(
  workspaceId: string | number,
  userId: number,
) {
  const [rows] = await db.query<(DbRow & { can_access: number })[]>(
    `SELECT (
       EXISTS(SELECT 1 FROM workspaces WHERE id = ? AND owner_id = ?)
       OR EXISTS(
         SELECT 1 FROM workspace_members
         WHERE workspace_id = ? AND user_id = ?
       )
       OR EXISTS(
         SELECT 1
         FROM project_members
         INNER JOIN projects ON projects.id = project_members.project_id
         WHERE projects.workspace_id = ? AND project_members.user_id = ?
       )
     )::int AS can_access`,
    [workspaceId, userId, workspaceId, userId, workspaceId, userId],
  );

  return Boolean(rows[0]?.can_access);
}

// Mirrors the project page: managers see every task, collaborators only their assigned ones.
export async function canViewTask(
  projectId: string | number,
  taskId: string | number,
  userId: number,
) {
  const access = await getTaskAccess(projectId, taskId, userId);
  return access.canManage || access.isAssigned;
}

export async function canChatOnTask(
  projectId: string | number,
  taskId: string | number,
  userId: number,
) {
  const [rows] = await db.query<TaskChatAccessRow[]>(
    `SELECT EXISTS(
       SELECT 1
       FROM tasks
       INNER JOIN projects ON projects.id = tasks.project_id
       LEFT JOIN task_assignees ON task_assignees.task_id = tasks.id
         AND task_assignees.user_id = ?
       WHERE tasks.id = ?
         AND tasks.project_id = ?
         AND (
           projects.owner_id = ?
           OR tasks.assignee_id = ?
           OR task_assignees.user_id IS NOT NULL
         )
     )::int AS can_chat`,
    [userId, taskId, projectId, userId, userId],
  );

  return Boolean(rows[0]?.can_chat);
}
