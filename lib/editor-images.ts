import db from "@/lib/db";
export async function ensureEditorImages() {
  await db.execute(`CREATE TABLE IF NOT EXISTS editor_images (
    id varchar(36) PRIMARY KEY, user_id integer NOT NULL, contents bytea NOT NULL
  )`);
}
