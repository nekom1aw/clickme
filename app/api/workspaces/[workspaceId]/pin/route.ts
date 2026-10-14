import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureWorkspacePins } from "@/lib/workspace-pins";
import { getSessionUserId } from "@/lib/session";
export async function PATCH(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({error:"Silakan login."},{status:401});
  const workspaceId = Number((await context.params).workspaceId);
  const body = await request.json();
  if (!Number.isInteger(workspaceId) || workspaceId < 1 || typeof body.isPinned !== "boolean") return NextResponse.json({error:"Data pin tidak valid."},{status:400});
  const [rows] = await db.query<DbRow[]>(`SELECT w.id FROM workspaces w WHERE w.id=? AND (
    w.owner_id=? OR EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=?)
    OR EXISTS (SELECT 1 FROM projects p INNER JOIN project_members pm ON pm.project_id=p.id WHERE p.workspace_id=w.id AND pm.user_id=?)
  )`,[workspaceId,userId,userId,userId]);
  if (!rows.length) return NextResponse.json({error:"Workspace tidak ditemukan."},{status:404});
  await ensureWorkspacePins();
  if(body.isPinned) await db.execute("INSERT INTO workspace_pins (workspace_id,user_id) VALUES (?,?) ON CONFLICT DO NOTHING",[workspaceId,userId]);
  else await db.execute("DELETE FROM workspace_pins WHERE workspace_id=? AND user_id=?",[workspaceId,userId]);
  return NextResponse.json({isPinned:body.isPinned});
}
