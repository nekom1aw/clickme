import { NextResponse } from "next/server";
import type { DbResult } from "@/lib/db";
import { randomBytes } from "crypto";
import db from "@/lib/db";
import { ensureWorkspacePublishingColumn } from "@/lib/workspace-schema";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

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

export async function POST(request: Request) {
  const body = await request.json();
  const ownerId = await getSessionUserId() || null;
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "workspace"}-${randomBytes(3).toString("hex")}`;

  if (!name) {
    return NextResponse.json(
      { error: "Workspace name wajib diisi." },
      { status: 400 },
    );
  }

  if (!ownerId) {
    return NextResponse.json(
      { error: "Silakan login terlebih dahulu." },
      { status: 401 },
    );
  }

  await ensureWorkspaceMembersTable();
  await ensureWorkspacePublishingColumn();

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute<DbResult>(
      `INSERT INTO workspaces (slug, owner_id, name, description)
       VALUES (?, ?, ?, ?)
       RETURNING id`,
      [slug, ownerId, name, description],
    );

    await connection.execute(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES (?, ?, 'administrator')`,
      [result.insertId, ownerId],
    );

    await connection.commit();

    return NextResponse.json(
      {
        workspace: {
          id: result.insertId,
          name,
          description,
          slug,
          isPublished: false,
          projects: [],
        },
      },
      { status: 201 },
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
