import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import {
  ensureTaskActivitiesTable,
  recordTaskActivity,
  type TaskActivityType,
} from "@/lib/task-activities";
import {
  canChatOnTask,
  canManageProject,
  canViewTask,
} from "@/lib/project-access";
import { getMonitoringTokenForTask } from "@/lib/data-request-monitoring";
import { getTaskPublicToken } from "@/lib/task-public-links";
import { resolveTaskAttachmentUrl } from "@/lib/minio-storage";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type TaskRow = DbRow & {
  id: number;
};

type ActivityRow = DbRow & {
  id: number;
  user_id: number | null;
  activity_type: TaskActivityType;
  message: string;
  created_at: Date;
  user_name: string | null;
  actor_name: string | null;
  attachment_id: number | null;
  attachment_name: string | null;
  attachment_url: string | null;
  attachment_stored_name: string | null;
  attachment_type: string | null;
};

async function taskExists(projectId: string, taskId: string) {
  const [tasks] = await db.query<TaskRow[]>(
    `SELECT id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1`,
    [taskId, projectId],
  );

  return Boolean(tasks[0]);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; taskId: string }> },
) {
  const { projectId, taskId } = await context.params;
  const currentUserId = await getSessionUserId();

  if (!currentUserId) {
    return NextResponse.json(
      { error: "Silakan login terlebih dahulu." },
      { status: 401 },
    );
  }

  if (
    !(await taskExists(projectId, taskId)) ||
    !(await canViewTask(projectId, taskId, currentUserId))
  ) {
    return NextResponse.json(
      { error: "Task tidak ditemukan." },
      { status: 404 },
    );
  }

  await ensureTaskActivitiesTable();
  const [rows] = await db.query<ActivityRow[]>(
    `SELECT task_activities.id, task_activities.user_id,
        task_activities.activity_type, task_activities.message,
        task_activities.created_at, users.name AS user_name,
        task_activities.actor_name,
        task_attachments.id AS attachment_id,
        task_attachments.original_name AS attachment_name,
        task_attachments.file_url AS attachment_url,
        task_attachments.stored_name AS attachment_stored_name,
        task_attachments.mime_type AS attachment_type
     FROM task_activities
     LEFT JOIN users ON users.id = task_activities.user_id
     LEFT JOIN task_attachments ON task_activities.activity_type = 'attachment'
       AND task_attachments.id = task_activities.related_id
     WHERE task_activities.task_id = ?
     ORDER BY task_activities.created_at ASC, task_activities.id ASC`,
    [taskId],
  );
  const monitoringToken = await getMonitoringTokenForTask(Number(taskId));
  const sharedToken = monitoringToken
    ? null
    : await getTaskPublicToken(Number(taskId));
  const activities = await Promise.all(
    rows.map(async (row) => ({
      id: Number(row.id),
      type: row.activity_type,
      message: row.message,
      actor:
        row.user_id === currentUserId
          ? "You"
          : row.user_name || row.actor_name || "System",
      isGuest: row.user_id === null && row.activity_type === "comment",
      createdAt: row.created_at.toISOString(),
      attachment: row.attachment_id
        ? {
            id: Number(row.attachment_id),
            name: row.attachment_name ?? "Attachment",
            url: await resolveTaskAttachmentUrl(
              row.attachment_url ?? "",
              row.attachment_stored_name,
            ),
            type: row.attachment_type ?? "application/octet-stream",
          }
        : null,
    })),
  );

  return NextResponse.json({
    canComment: await canChatOnTask(projectId, taskId, currentUserId),
    canPublish: await canManageProject(projectId, currentUserId),
    publicLink: monitoringToken
      ? { url: `/monitoring/${monitoringToken}`, kind: "data_request" }
      : sharedToken
        ? { url: `/monitoring/${sharedToken}`, kind: "shared" }
        : null,
    activities,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; taskId: string }> },
) {
  const { projectId, taskId } = await context.params;
  const userId = await getSessionUserId();
  const body = await request.json();
  const message = String(body.message ?? "").trim();

  if (!message) {
    return NextResponse.json(
      { error: "Komentar wajib diisi." },
      { status: 400 },
    );
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Silakan login terlebih dahulu." },
      { status: 401 },
    );
  }

  if (!(await taskExists(projectId, taskId))) {
    return NextResponse.json(
      { error: "Task tidak ditemukan." },
      { status: 404 },
    );
  }


  if (!(await canChatOnTask(projectId, taskId, userId))) {
    return NextResponse.json(
      { error: "Hanya owner project dan assignee task yang dapat mengirim chat." },
      { status: 403 },
    );
  }

  await recordTaskActivity({
    taskId: Number(taskId),
    userId,
    type: "comment",
    message,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
