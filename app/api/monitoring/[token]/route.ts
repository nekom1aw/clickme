import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import {
  getPublicMonitoringTask,
  resolvePublicTaskToken,
} from "@/lib/data-request-monitoring";
import { getClientIp, isRateLimited, recordRateLimitEvent } from "@/lib/rate-limit";
import { recordTaskActivity } from "@/lib/task-activities";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const task = await getPublicMonitoringTask(token);

  if (!task) {
    return NextResponse.json(
      { error: "Link monitoring tidak ditemukan." },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { task },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    name?: string;
  };
  const message = String(body.message ?? "").trim();

  if (!message) {
    return NextResponse.json(
      { error: "Pesan wajib diisi." },
      { status: 400 },
    );
  }
  if (message.length > 500) {
    return NextResponse.json(
      { error: "Pesan maksimal 500 karakter." },
      { status: 400 },
    );
  }

  const access = await resolvePublicTaskToken(token);

  if (!access) {
    return NextResponse.json(
      { error: "Link monitoring tidak ditemukan." },
      { status: 404 },
    );
  }

  const ipBucket = `public-chat:ip:${getClientIp(request)}`;
  if (await isRateLimited(ipBucket, 30, 10 * 60)) {
    return NextResponse.json(
      { error: "Terlalu banyak pesan. Tunggu sebentar lalu coba lagi." },
      { status: 429 },
    );
  }

  // Shared links have no fixed requester, so each visitor signs messages with a name.
  const actorName =
    access.kind === "data_request"
      ? access.requesterName?.trim() || "Pemohon"
      : String(body.name ?? "").trim().replace(/\s+/g, " ");

  if (!actorName) {
    return NextResponse.json(
      { error: "Nama wajib diisi." },
      { status: 400 },
    );
  }
  if (actorName.length > 60) {
    return NextResponse.json(
      { error: "Nama maksimal 60 karakter." },
      { status: 400 },
    );
  }

  const [rateRows] = await db.query<
    (DbRow & { comment_count: number })[]
  >(
    `SELECT COUNT(*) AS comment_count
     FROM task_activities
     WHERE task_id = ?
       AND user_id IS NULL
       AND activity_type = 'comment'
       AND created_at >= NOW() - INTERVAL '1 minute'`,
    [access.taskId],
  );
  if (Number(rateRows[0]?.comment_count ?? 0) >= 10) {
    return NextResponse.json(
      { error: "Terlalu banyak pesan. Tunggu sebentar lalu coba lagi." },
      { status: 429 },
    );
  }

  await recordRateLimitEvent(ipBucket);
  await recordTaskActivity({
    taskId: access.taskId,
    userId: null,
    actorName,
    type: "comment",
    message,
  });

  const [insertRows] = await db.query<
    (DbRow & { id: number; created_at: Date })[]
  >(
    `SELECT id, created_at
     FROM task_activities
     WHERE task_id = ? AND user_id IS NULL AND activity_type = 'comment'
     ORDER BY id DESC
     LIMIT 1`,
    [access.taskId],
  );

  return NextResponse.json(
    {
      activity: {
        id: Number(insertRows[0]?.id ?? 0),
        type: "comment",
        message,
        actor: actorName,
        isGuest: true,
        createdAt: insertRows[0]?.created_at?.toISOString() ?? new Date().toISOString(),
      },
    },
    { status: 201 },
  );
}
