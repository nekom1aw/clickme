import db from "@/lib/db";
import type { DbRow } from "@/lib/db";

type ColumnRow = DbRow & {
  column_name: string;
};

let publishingColumnPromise: Promise<void> | null = null;

export function ensureProjectPublishingColumn() {
  if (!publishingColumnPromise) {
    publishingColumnPromise = (async () => {
      const [columns] = await db.query<ColumnRow[]>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'projects'
           AND column_name = 'publish_override'
         LIMIT 1`,
      );

      if (!columns[0]) {
        await db.execute(
          `ALTER TABLE projects
           ADD COLUMN publish_override smallint NULL`,
        );
      }
    })().catch((error) => {
      publishingColumnPromise = null;
      throw error;
    });
  }

  return publishingColumnPromise;
}
