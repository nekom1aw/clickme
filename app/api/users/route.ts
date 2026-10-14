import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type UserRow = DbRow & {
  id: number;
  name: string;
  email: string;
  direktorat: string | null;
};

export async function GET(request: Request) {
  const currentUserId = await getSessionUserId();

  if (!currentUserId) {
    return NextResponse.json({ users: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ users: [] });
  const keyword = `%${query.replace(/[\\%_]/g, "\\$&")}%`;

  // Fuzzy search only covers people who already share a workspace with the caller;
  // anyone else is found by their exact email, so the directory can't be dumped.
  const [users] = await db.query<UserRow[]>(
    `WITH my_workspaces AS (
       SELECT id AS workspace_id FROM workspaces WHERE owner_id = ?
       UNION SELECT workspace_id FROM workspace_members WHERE user_id = ?
       UNION SELECT projects.workspace_id
       FROM project_members
       INNER JOIN projects ON projects.id = project_members.project_id
       WHERE project_members.user_id = ?
     ), colleagues AS (
       SELECT owner_id AS user_id FROM workspaces
       WHERE id IN (SELECT workspace_id FROM my_workspaces)
       UNION SELECT user_id FROM workspace_members
       WHERE workspace_id IN (SELECT workspace_id FROM my_workspaces)
       UNION SELECT project_members.user_id
       FROM project_members
       INNER JOIN projects ON projects.id = project_members.project_id
       WHERE projects.workspace_id IN (SELECT workspace_id FROM my_workspaces)
     )
     SELECT id, name, email, direktorat
     FROM users
     WHERE id <> ?
       AND (
         LOWER(email) = LOWER(?)
         OR (
           id IN (SELECT user_id FROM colleagues)
           AND (name ILIKE ? ESCAPE '\\' OR email ILIKE ? ESCAPE '\\' OR direktorat ILIKE ? ESCAPE '\\')
         )
       )
     ORDER BY name ASC
     LIMIT 12`,
    [
      currentUserId,
      currentUserId,
      currentUserId,
      currentUserId,
      query,
      keyword,
      keyword,
      keyword,
    ],
  );

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      direktorat: user.direktorat ?? "",
    })),
  });
}
