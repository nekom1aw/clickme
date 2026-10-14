import { randomBytes } from "crypto";
import type { DbResult, DbRow } from "@/lib/db";
import db from "@/lib/db";

let schemaPromise: Promise<void> | null = null;

// A row means the task is published; deleting it revokes the link immediately.
async function createSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_public_links (
      task_id integer PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      public_token varchar(64) NOT NULL CONSTRAINT task_public_links_token_unique UNIQUE,
      created_by integer NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function ensureTaskPublicLinksSchema() {
  schemaPromise ??= createSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}

export async function getTaskPublicToken(taskId: number) {
  await ensureTaskPublicLinksSchema();

  const [rows] = await db.query<(DbRow & { public_token: string })[]>(
    `SELECT public_token FROM task_public_links WHERE task_id = ? LIMIT 1`,
    [taskId],
  );

  return rows[0]?.public_token ?? null;
}

export async function publishTask(taskId: number, userId: number) {
  await ensureTaskPublicLinksSchema();

  const [result] = await db.execute<DbResult>(
    `INSERT INTO task_public_links (task_id, public_token, created_by)
     VALUES (?, ?, ?)
     ON CONFLICT (task_id) DO NOTHING`,
    [taskId, randomBytes(24).toString("base64url"), userId],
  );

  return {
    token: await getTaskPublicToken(taskId),
    created: result.affectedRows > 0,
  };
}

export async function unpublishTask(taskId: number) {
  await ensureTaskPublicLinksSchema();

  const [result] = await db.execute<DbResult>(
    `DELETE FROM task_public_links WHERE task_id = ?`,
    [taskId],
  );

  return result.affectedRows > 0;
}
