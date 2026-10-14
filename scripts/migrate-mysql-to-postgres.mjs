// Copies every Clickme table from MySQL/MariaDB into PostgreSQL.
// Usage: node --env-file=.env.local scripts/migrate-mysql-to-postgres.mjs [--reset]
//   MYSQL_*    source (defaults: 127.0.0.1:3306 root, database clickme)
//   POSTGRES_* target (see lib/db.ts)
// The target schema comes from db/postgres/schema.sql. Without --reset the script refuses
// to write into tables that already contain rows; --reset drops and recreates them first.
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import pg from "pg";

// Parents before children so foreign keys hold while rows are inserted.
const TABLES = [
  "users", "workspaces", "projects", "project_statuses", "tasks", "project_members",
  "email_verification_codes", "user_profile_photos", "workspace_members", "workspace_pins",
  "workspace_tags", "workspace_invitations", "task_activities", "task_assignees",
  "task_attachments", "task_tags", "editor_images", "editor_videos", "in_app_messages",
  "native_forms", "native_form_images", "native_form_responses", "data_request_import_sources",
  "data_request_import_rows", "data_request_public_access", "sheet_source_settings",
  "sheet_notification_queue", "sheet_notification_deliveries", "whatsapp_group_connections",
];
const BATCH_SIZE = 200;
const reset = process.argv.includes("--reset");

const source = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE ?? "clickme",
  // Keep DATETIME/TIMESTAMP as wall-clock text; Postgres interprets it in the source's offset below.
  dateStrings: true,
});
const target = new pg.Client({
  host: process.env.POSTGRES_HOST ?? "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "postgres",
  password: process.env.POSTGRES_PASSWORD ?? "",
  database: process.env.POSTGRES_DATABASE ?? "clickme",
});
await target.connect();

try {
  const [[{ offset }]] = await source.query("SELECT TIME_FORMAT(TIMEDIFF(NOW(), UTC_TIMESTAMP()), '%H:%i') AS offset");
  const sign = offset.startsWith("-") ? "-" : "+";
  const sourceOffset = `${sign}${offset.replace(/^[-+]/, "")}`;
  const [sourceTables] = await source.query(
    "SELECT table_name AS name, auto_increment AS next_id FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  const sourceInfo = new Map(sourceTables.map((row) => [row.name, row]));
  const unknown = [...sourceInfo.keys()].filter((name) => !TABLES.includes(name));
  if (unknown.length) throw new Error(`Source tables without a Postgres mapping: ${unknown.join(", ")}`);

  await target.query("BEGIN");
  await target.query(`SET LOCAL TIME ZONE INTERVAL '${sourceOffset}' HOUR TO MINUTE`);
  if (reset) {
    await target.query(`DROP TABLE IF EXISTS ${TABLES.join(", ")} CASCADE`);
  }
  await target.query(readFileSync(new URL("../db/postgres/schema.sql", import.meta.url), "utf8"));

  const summary = [];
  for (const table of TABLES) {
    const { rows: [{ count: existing }] } = await target.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    if (existing) throw new Error(`${table} already has ${existing} rows in Postgres. Re-run with --reset to replace them.`);
    if (!sourceInfo.has(table)) {
      summary.push({ table, mysql: "-", postgres: 0 });
      continue;
    }

    const { rows: targetColumns } = await target.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1",
      [table],
    );
    const targetTypes = new Map(targetColumns.map((column) => [column.column_name, column.data_type]));
    const [rows, fields] = await source.query(`SELECT * FROM \`${table}\``);
    const columns = fields.map((field) => field.name);
    const missing = columns.filter((column) => !targetTypes.has(column));
    if (missing.length) throw new Error(`${table}: Postgres schema lacks column(s) ${missing.join(", ")}`);

    const convert = (value) => {
      if (value === null || value === undefined) return null;
      // MariaDB zero dates have no Postgres equivalent.
      if (typeof value === "string" && value.startsWith("0000-00-00")) return null;
      return value;
    };
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const values = [];
      const tuples = batch.map((row) => `(${columns.map((column) => {
        values.push(convert(row[column]));
        return `$${values.length}`;
      }).join(", ")})`);
      await target.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`, values);
    }

    if (targetTypes.has("id")) {
      const { rows: [{ sequence }] } = await target.query("SELECT pg_get_serial_sequence($1, 'id') AS sequence", [table]);
      if (sequence) {
        // Continue from MySQL's AUTO_INCREMENT so ids of deleted rows are never reused.
        const nextId = Math.max(Number(sourceInfo.get(table).next_id ?? 1), 1);
        await target.query(
          `SELECT setval($1, GREATEST($2::bigint - 1, COALESCE((SELECT MAX(id) FROM ${table}), 0), 1), GREATEST($2::bigint - 1, COALESCE((SELECT MAX(id) FROM ${table}), 0)) >= 1)`,
          [sequence, nextId],
        );
      }
    }
    const { rows: [{ count }] } = await target.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    summary.push({ table, mysql: rows.length, postgres: count });
  }

  const mismatched = summary.filter((row) => row.mysql !== "-" && row.mysql !== row.postgres);
  if (mismatched.length) throw new Error(`Row counts differ: ${mismatched.map((row) => row.table).join(", ")}`);
  await target.query("COMMIT");
  console.table(summary);
  console.log(`Migrated ${summary.reduce((total, row) => total + row.postgres, 0)} rows (source offset ${sourceOffset}).`);
} catch (error) {
  await target.query("ROLLBACK").catch(() => {});
  console.error("Migration failed; Postgres was left unchanged.", error.message);
  process.exitCode = 1;
} finally {
  await source.end();
  await target.end();
}
