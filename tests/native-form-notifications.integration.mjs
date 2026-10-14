import assert from "node:assert/strict";
import { createTestDatabase } from "./postgres-test-database.mjs";
const previousFetch = globalThis.fetch;
// Direct mode only sends to operator-allowlisted numbers.
process.env.WAHA_DIRECT_RECIPIENTS = "628123456789";
let database;
let pool;
try {
  database = await createTestDatabase("clickme_forms_test", [
    "users",
    "workspaces",
    "projects",
    "project_statuses",
    "tasks",
    "task_activities",
    "native_form_responses",
    "sheet_notification_queue",
    "sheet_notification_deliveries",
    "whatsapp_group_connections",
  ]);
  process.env.WAHA_API_URL = "http://mock-waha.invalid";
  process.env.WAHA_API_KEY = "test";
  const sent = [];
  let failGroup = true;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "http://mock-waha.invalid/api/sendText");
    const body = JSON.parse(options.body);
    if (body.chatId === "project@g.us" && failGroup)
      throw new Error("Simulated delivery outage");
    sent.push(body);
    return Response.json({ id: "mock-message" });
  };
  pool = (await import("../lib/db.ts")).default;
  const { createFormTask } = await import("../lib/native-form-submit.ts");
  const { flushSheetNotifications } =
    await import("../lib/sheet-notification-queue.ts");
  const { defaultAutomation } =
    await import("../lib/native-form-automation.ts");
  await pool.execute(
    "INSERT INTO workspaces (id,owner_id,name,slug) VALUES (1,1,'Workspace','workspace')",
  );
  await pool.execute(
    "INSERT INTO projects (id,workspace_id,owner_id,name,slug,view_slug) VALUES (1,1,1,'Inbox','inbox','view')",
  );
  await pool.execute(
    "INSERT INTO project_statuses (id,project_id,name,color,category,position,is_default) VALUES (1,1,'TO DO','neutral','not_started',1,1)",
  );
  await pool.execute(
    "INSERT INTO whatsapp_group_connections (scope_type,scope_id,group_chat_id) VALUES ('workspace',1,'workspace@g.us'),('project',1,'project@g.us')",
  );
  const fields = [
    { id: "name", label: "Name", type: "text", required: true, options: [] },
  ];
  const form = {
    id: 1,
    title: "Request",
    projectId: 1,
    workspaceId: 1,
    fields,
    automation: {
      ...defaultAutomation,
      taskTitle: "Request {{field:name}}",
      whatsappEnabled: true,
      whatsappMode: "direct",
      whatsappRecipient: "628123456789",
      whatsappTemplate: "{{task}} / {{project}} / {{field:name}}",
    },
  };
  async function submit() {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [response] = await connection.execute(
        "INSERT INTO native_form_responses (form_id,answers,fields) VALUES (1,?,?) RETURNING id",
        [JSON.stringify({ name: "Tester" }), JSON.stringify(fields)],
      );
      const taskId = await createFormTask(connection, form, response.insertId, {
        name: "Tester",
      });
      await connection.commit();
      return taskId;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  }
  await submit();
  let result = await flushSheetNotifications();
  assert.equal(result.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, "628123456789@c.us");
  assert.equal(sent[0].text, "Request Tester / Inbox / Tester");
  await flushSheetNotifications();
  assert.equal(sent.length, 1);
  form.automation.whatsappMode = "groups";
  await submit();
  result = await flushSheetNotifications();
  assert.equal(result.failed, 1);
  failGroup = false;
  await pool.execute(
    "UPDATE sheet_notification_queue SET next_attempt_at=NOW() WHERE sent_at IS NULL",
  );
  result = await flushSheetNotifications();
  assert.equal(result.sent, 1);
  assert.equal(sent.filter((s) => s.chatId === "workspace@g.us").length, 1);
  assert.equal(sent.filter((s) => s.chatId === "project@g.us").length, 1);
  // Queue insertion and task creation are rolled back together when the caller fails.
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  await createFormTask(connection, form, 999, { name: "Rollback" });
  await connection.rollback();
  connection.release();
  assert.equal((await pool.query("SELECT COUNT(*) n FROM tasks"))[0][0].n, 2);
  assert.equal(
    (await pool.query("SELECT COUNT(*) n FROM sheet_notification_queue"))[0][0]
      .n,
    2,
  );
  console.log(
    "PASS: task title template, direct WhatsApp, workspace/project groups, queued retry, recipient deduplication, transaction rollback. All delivery mocked; no real messages.",
  );
} finally {
  globalThis.fetch = previousFetch;
  if (pool) await pool.end();
  if (database) await database.drop();
}
