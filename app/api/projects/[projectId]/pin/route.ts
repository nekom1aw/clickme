import { NextResponse } from "next/server";
import type { DbResult } from "@/lib/db";
import db from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const userId = await getSessionUserId();
  const { projectId } = await context.params;
  const body = await request.json();
  const isPinned = Boolean(body.isPinned);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [result] = await db.execute<DbResult>(
    `UPDATE project_members
     SET is_pinned = ?
     WHERE project_id = ? AND user_id = ?`,
    [isPinned ? 1 : 0, projectId, userId],
  );

  if (result.affectedRows === 0) {
    return NextResponse.json(
      { error: "Project member not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ isPinned });
}
