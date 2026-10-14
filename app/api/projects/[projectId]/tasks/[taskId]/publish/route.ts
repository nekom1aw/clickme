import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { getMonitoringTokenForTask } from "@/lib/data-request-monitoring";
import { canManageProject } from "@/lib/project-access";
import { recordTaskActivity } from "@/lib/task-activities";
import { publishTask, unpublishTask } from "@/lib/task-public-links";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ projectId: string; taskId: string }> };

async function authorize(projectId: string, taskId: string) {
  const userId = await getSessionUserId();

  if (!userId) {
    return {
      error: NextResponse.json(
        { error: "Silakan login terlebih dahulu." },
        { status: 401 },
      ),
    };
  }

  const [tasks] = await db.query<(DbRow & { id: number })[]>(
    `SELECT id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1`,
    [taskId, projectId],
  );

  if (!tasks[0]) {
    return {
      error: NextResponse.json(
        { error: "Task tidak ditemukan." },
        { status: 404 },
      ),
    };
  }

  if (!(await canManageProject(projectId, userId))) {
    return {
      error: NextResponse.json(
        { error: "Hanya pengelola project yang dapat mengatur publikasi task." },
        { status: 403 },
      ),
    };
  }

  return { userId, taskId: Number(tasks[0].id) };
}

export async function POST(_request: Request, context: RouteContext) {
  const { projectId, taskId } = await context.params;
  const auth = await authorize(projectId, taskId);

  if ("error" in auth) {
    return auth.error;
  }

  if (await getMonitoringTokenForTask(auth.taskId)) {
    return NextResponse.json(
      { error: "Task ini sudah memiliki link monitoring pemohon." },
      { status: 409 },
    );
  }

  const { token, created } = await publishTask(auth.taskId, auth.userId);

  if (created) {
    await recordTaskActivity({
      taskId: auth.taskId,
      userId: auth.userId,
      type: "updated",
      message: "published this task to a public link",
    });
  }

  return NextResponse.json(
    { publicLink: { url: `/monitoring/${token}`, kind: "shared" } },
    { status: created ? 201 : 200 },
  );
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { projectId, taskId } = await context.params;
  const auth = await authorize(projectId, taskId);

  if ("error" in auth) {
    return auth.error;
  }

  if (await unpublishTask(auth.taskId)) {
    await recordTaskActivity({
      taskId: auth.taskId,
      userId: auth.userId,
      type: "updated",
      message: "stopped publishing this task",
    });
  }

  return NextResponse.json({ publicLink: null });
}
