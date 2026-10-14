import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { notifyTaskCreatedToWhatsappGroup, type TaskCreatedNotification } from "@/lib/task-whatsapp-notification";

export async function ensureSheetNotificationQueue() {
  await db.execute(`CREATE TABLE IF NOT EXISTS sheet_notification_queue (
    task_id integer PRIMARY KEY, payload text NOT NULL, attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS sheet_notification_deliveries (
    task_id integer NOT NULL, recipient varchar(191) NOT NULL,
    sent_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (task_id, recipient)
  )`);
}

export async function flushSheetNotifications() {
  const summary = { sent: 0, failed: 0, skipped: 0 };
  const connection = await db.getConnection();
  try {
    const [locks] = await connection.query<DbRow[]>("SELECT pg_try_advisory_lock(hashtext('clickme:sheet-notifications')) AS acquired");
    if (!locks[0]?.acquired) return summary;
    const [rows] = await connection.query<DbRow[]>(`SELECT task_id, payload FROM sheet_notification_queue
      WHERE sent_at IS NULL AND next_attempt_at <= NOW() ORDER BY task_id LIMIT 20`);
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload) as TaskCreatedNotification;
        const result = await notifyTaskCreatedToWhatsappGroup({ ...payload, deliveryKey: Number(row.task_id) });
        if (result.status === "sent") {
          await connection.execute("UPDATE sheet_notification_queue SET sent_at = NOW(), attempts = attempts + 1 WHERE task_id = ?", [row.task_id]);
          summary.sent++;
          continue;
        }
        summary.skipped++;
      } catch {
        summary.failed++;
        console.error(`[Sheet notification] task=${row.task_id} failed; queued for retry.`);
      }
      await connection.execute("UPDATE sheet_notification_queue SET attempts = attempts + 1, next_attempt_at = NOW() + INTERVAL '60 seconds' WHERE task_id = ?", [row.task_id]);
    }
    return summary;
  } finally {
    await connection.query("SELECT pg_advisory_unlock(hashtext('clickme:sheet-notifications'))");
    connection.release();
  }
}
