import db from "@/lib/db";
import type { DbRow } from "@/lib/db";

type ColumnRow = DbRow & {
  column_name: string;
};

let publishingColumnPromise: Promise<void> | null = null;

export function ensureWorkspacePublishingColumn() {
  if (!publishingColumnPromise) {
    publishingColumnPromise = (async () => {
      const [columns] = await db.query<ColumnRow[]>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'workspaces'
           AND column_name = 'is_published'
         LIMIT 1`,
      );

      if (!columns[0]) {
        await db.execute(
          `ALTER TABLE workspaces
           ADD COLUMN is_published smallint NOT NULL DEFAULT 0`,
        );
      }
    })().catch((error) => {
      publishingColumnPromise = null;
      throw error;
    });
  }

  return publishingColumnPromise;
}

let archivePromise: Promise<void> | null = null;
export function ensureWorkspaceArchiveColumn() {
  return archivePromise ??= (async () => {
    const [rows] = await db.query<DbRow[]>("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'workspaces' AND column_name = 'is_archived'");
    if (!rows.length) await db.execute("ALTER TABLE workspaces ADD COLUMN is_archived smallint NOT NULL DEFAULT 0");
  })().catch(error => { archivePromise = null; throw error; });
}
