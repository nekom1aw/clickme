import { NextResponse } from "next/server";
import type { DbResult, DbRow } from "@/lib/db";
import db from "@/lib/db";
import { canManageProject } from "@/lib/project-access";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS_COLORS = ["teal", "blue", "green", "orange", "purple", "neutral"];

type MaxPositionRow = DbRow & {
  max_position: number | null;
};

type DbError = {
  code?: string;
  message?: string;
};

type StatusPatch = {
  id?: number;
  category?: string;
  position?: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const userId = await getSessionUserId();

  if (!userId) {
    return NextResponse.json(
      { error: "Silakan login terlebih dahulu." },
      { status: 401 },
    );
  }

  if (!(await canManageProject(projectId, userId))) {
    return NextResponse.json(
      { error: "Hanya pengelola project yang dapat mengubah status." },
      { status: 403 },
    );
  }

  const body = await request.json();
  const name = String(body.name ?? "").trim().toUpperCase();
  const color = STATUS_COLORS.includes(String(body.color))
    ? String(body.color)
    : "neutral";
  const category = String(body.category ?? "active");

  if (!name) {
    return NextResponse.json(
      { error: "Nama status wajib diisi." },
      { status: 400 },
    );
  }

  if (!["not_started", "active", "closed"].includes(category)) {
    return NextResponse.json(
      { error: "Kategori status tidak valid." },
      { status: 400 },
    );
  }

  try {
    const [positions] = await db.query<MaxPositionRow[]>(
      `SELECT MAX(position) AS max_position
       FROM project_statuses
       WHERE project_id = ?`,
      [projectId],
    );

    const nextPosition = (positions[0]?.max_position ?? 0) + 1;

    const [result] = await db.execute<DbResult>(
      `INSERT INTO project_statuses (project_id, name, color, category, position, is_default)
       VALUES (?, ?, ?, ?, ?, 0)
       RETURNING id`,
      [projectId, name, color, category, nextPosition],
    );

    return NextResponse.json(
      {
        status: {
          id: result.insertId,
          name,
          color,
          category,
          position: nextPosition,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const dbError = error as DbError;

    if (dbError.code === "23505") {
      return NextResponse.json(
        { error: "Status dengan nama itu sudah ada." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Gagal membuat status." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const userId = await getSessionUserId();

  if (!userId) {
    return NextResponse.json(
      { error: "Silakan login terlebih dahulu." },
      { status: 401 },
    );
  }

  if (!(await canManageProject(projectId, userId))) {
    return NextResponse.json(
      { error: "Hanya pengelola project yang dapat mengubah status." },
      { status: 403 },
    );
  }

  const body = await request.json();
  const statuses = Array.isArray(body.statuses)
    ? (body.statuses as StatusPatch[])
    : [];

  if (!statuses.length) {
    return NextResponse.json(
      { error: "Status wajib diisi." },
      { status: 400 },
    );
  }

  if (
    statuses.some(
      (status) =>
        !status.id ||
        !status.category ||
        !["not_started", "active", "closed"].includes(status.category),
    )
  ) {
    return NextResponse.json(
      { error: "Data status tidak valid." },
      { status: 400 },
    );
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    for (const [index, status] of statuses.entries()) {
      await connection.query(
        `UPDATE project_statuses
         SET category = ?, position = ?
         WHERE id = ? AND project_id = ?`,
        [status.category, status.position ?? index + 1, status.id, projectId],
      );
    }

    await connection.commit();

    return NextResponse.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
