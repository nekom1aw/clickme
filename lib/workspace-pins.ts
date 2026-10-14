import db from "@/lib/db";
export async function ensureWorkspacePins() {
  await db.execute(`CREATE TABLE IF NOT EXISTS workspace_pins (
    workspace_id integer NOT NULL, user_id integer NOT NULL,
    PRIMARY KEY (workspace_id,user_id)
  )`);
}
