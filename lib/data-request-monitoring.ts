import { randomBytes } from "crypto";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureTaskActivitiesTable } from "@/lib/task-activities";
import { ensureTaskPublicLinksSchema } from "@/lib/task-public-links";

let schemaPromise: Promise<void> | null = null;

export type PublicMonitoringActivity = {
  id: number;
  type: string;
  message: string;
  actor: string;
  isGuest: boolean;
  createdAt: string;
};

// "data_request" links belong to one requester; "shared" links are published
// from the task detail and anyone holding them can chat under their own name.
export type PublicTaskLinkKind = "data_request" | "shared";

export type PublicTaskAccess = {
  taskId: number;
  kind: PublicTaskLinkKind;
  requesterName: string | null;
};

export type PublicMonitoringTask = {
  id: number;
  kind: PublicTaskLinkKind;
  name: string;
  projectName: string;
  description: string;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  requesterName: string;
  status: {
    name: string;
    category: "not_started" | "active" | "closed";
    color: string;
  };
  activities: PublicMonitoringActivity[];
};

export function createMonitoringToken() {
  return randomBytes(24).toString("base64url");
}

async function createSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS data_request_public_access (
      task_id integer PRIMARY KEY,
      public_token varchar(64) NOT NULL CONSTRAINT data_request_public_token_unique UNIQUE,
      requester_name varchar(191) NULL,
      requester_email varchar(191) NULL,
      requester_contact varchar(191) NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureTaskActivitiesTable();

  let missingRows: (DbRow & { task_id: number })[] = [];
  try {
    [missingRows] = await db.query<
      (DbRow & { task_id: number })[]
    >(
      `SELECT DISTINCT data_request_import_rows.task_id
       FROM data_request_import_rows
       LEFT JOIN data_request_public_access
         ON data_request_public_access.task_id = data_request_import_rows.task_id
       WHERE data_request_public_access.task_id IS NULL`,
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") {
      throw error;
    }
  }

  for (const row of missingRows) {
    await db.execute(
      `INSERT INTO data_request_public_access (task_id, public_token)
       VALUES (?, ?)
       ON CONFLICT DO NOTHING`,
      [row.task_id, createMonitoringToken()],
    );
  }
}

export async function ensureDataRequestMonitoringSchema() {
  schemaPromise ??= createSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}

export async function getMonitoringTokenForTask(taskId: number) {
  await ensureDataRequestMonitoringSchema();

  const [rows] = await db.query<
    (DbRow & { public_token: string })[]
  >(
    `SELECT data_request_public_access.public_token
     FROM data_request_public_access
     INNER JOIN tasks ON tasks.id = data_request_public_access.task_id
     INNER JOIN projects ON projects.id = tasks.project_id
     INNER JOIN workspaces ON workspaces.id = projects.workspace_id
     WHERE data_request_public_access.task_id = ?
       AND LOWER(workspaces.name) = 'permintaan data'
     LIMIT 1`,
    [taskId],
  );

  return rows[0]?.public_token ?? null;
}

export async function resolvePublicTaskToken(
  token: string,
): Promise<PublicTaskAccess | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return null;
  }

  await ensureDataRequestMonitoringSchema();
  await ensureTaskPublicLinksSchema();

  const [rows] = await db.query<
    (DbRow & {
      task_id: number;
      kind: PublicTaskLinkKind;
      requester_name: string | null;
    })[]
  >(
    `SELECT data_request_public_access.task_id, 'data_request' AS kind,
        data_request_public_access.requester_name
     FROM data_request_public_access
     INNER JOIN tasks ON tasks.id = data_request_public_access.task_id
     INNER JOIN projects ON projects.id = tasks.project_id
     INNER JOIN workspaces ON workspaces.id = projects.workspace_id
     WHERE data_request_public_access.public_token = ?
       AND LOWER(workspaces.name) = 'permintaan data'
     UNION ALL
     SELECT task_public_links.task_id, 'shared' AS kind, NULL AS requester_name
     FROM task_public_links
     WHERE task_public_links.public_token = ?
     LIMIT 1`,
    [token, token],
  );
  const access = rows[0];

  return access
    ? {
        taskId: Number(access.task_id),
        kind: access.kind,
        requesterName: access.requester_name,
      }
    : null;
}

export async function getPublicMonitoringTask(
  token: string,
): Promise<PublicMonitoringTask | null> {
  const access = await resolvePublicTaskToken(token);

  if (!access) {
    return null;
  }

  const [rows] = await db.query<
    (DbRow & {
      id: number;
      name: string;
      project_name: string;
      description: string | null;
      start_date: Date | null;
      due_date: Date | null;
      created_at: Date;
      status_name: string;
      status_category: "not_started" | "active" | "closed";
      status_color: string;
    })[]
  >(
    `SELECT tasks.id, tasks.name, projects.name AS project_name,
        tasks.description, tasks.start_date, tasks.due_date, tasks.created_at,
        project_statuses.name AS status_name,
        project_statuses.category AS status_category,
        project_statuses.color AS status_color
     FROM tasks
     INNER JOIN projects ON projects.id = tasks.project_id
     INNER JOIN project_statuses ON project_statuses.id = tasks.status_id
     WHERE tasks.id = ?
     LIMIT 1`,
    [access.taskId],
  );

  const task = rows[0];
  if (!task) {
    return null;
  }

  const [activityRows] = await db.query<
    (DbRow & {
      id: number;
      activity_type: string;
      message: string;
      created_at: Date;
      user_id: number | null;
      user_name: string | null;
      actor_name: string | null;
    })[]
  >(
    `SELECT task_activities.id, task_activities.activity_type, task_activities.user_id,
        task_activities.message, task_activities.created_at,
        users.name AS user_name, task_activities.actor_name
     FROM task_activities
     LEFT JOIN users ON users.id = task_activities.user_id
     WHERE task_activities.task_id = ?
       AND task_activities.activity_type IN
         ('created', 'status', 'date', 'description', 'comment')
     ORDER BY task_activities.created_at ASC, task_activities.id ASC`,
    [task.id],
  );

  return {
    id: Number(task.id),
    kind: access.kind,
    name: task.name,
    projectName: task.project_name,
    description: task.description ?? "",
    startDate: task.start_date?.toISOString() ?? null,
    dueDate: task.due_date?.toISOString() ?? null,
    createdAt: task.created_at.toISOString(),
    requesterName: access.requesterName?.trim() || "Pemohon",
    status: {
      name: task.status_name,
      category: task.status_category,
      color: task.status_color,
    },
    activities: activityRows.map((activity) => ({
      id: Number(activity.id),
      type: activity.activity_type,
      message: activity.message,
      actor: activity.user_name || activity.actor_name || "System",
      isGuest: activity.user_id === null,
      createdAt: activity.created_at.toISOString(),
    })),
  };
}
