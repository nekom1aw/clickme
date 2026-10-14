import type { DbConnection, DbResult, DbRow } from "@/lib/db";
import {
  formAnswerText,
  renderFormTemplate,
  type FormAutomation,
} from "@/lib/native-form-automation";
import type { FormField } from "@/lib/native-form-fields";
export async function createFormTask(
  connection: DbConnection,
  form: {
    id: number;
    title: string;
    projectId: number | null;
    workspaceId: number | null;
    fields: FormField[];
    automation: FormAutomation;
  },
  responseId: number,
  answers: Record<string, string | string[]>,
) {
  if (!form.projectId) return null;
  const [projects] = await connection.query<DbRow[]>(
    `SELECT p.name, p.slug, w.name AS "workspaceName" FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=? AND p.workspace_id=?`,
    [form.projectId, form.workspaceId],
  );
  if (!projects[0])
    throw new Error("Project tujuan form sudah tidak tersedia.");
  const [statuses] = await connection.query<DbRow[]>(
    "SELECT id FROM project_statuses WHERE project_id=? ORDER BY is_default DESC, position, id LIMIT 1",
    [form.projectId],
  );
  if (!statuses[0])
    throw new Error("Project tujuan belum memiliki status task.");
  const allAnswers = formAnswerText(form.fields, answers);
  const taskPath = `/team/projects/${projects[0].slug}/v/l`;
  const values: Record<string, string> = {
    form: form.title,
    response_id: String(responseId),
    project: projects[0].name,
    workspace: projects[0].workspaceName,
    answers: allAnswers,
    task: form.title,
    task_url: `${(process.env.APP_URL || "").replace(/\/+$/, "")}${taskPath}`,
  };
  for (const f of form.fields)
    values[`field:${f.id}`] = Array.isArray(answers[f.id])
      ? (answers[f.id] as string[]).join(", ")
      : String(answers[f.id] ?? "");
  const taskName =
    renderFormTemplate(form.automation.taskTitle, values)
      .slice(0, 255)
      .trim() || `${form.title} #${responseId}`.slice(0, 255);
  // Store structured text so submitted HTML is rendered as text by the task editor.
  const description = JSON.stringify({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `Form: ${form.title} · Jawaban #${responseId}`,
          },
        ],
      },
      ...form.fields.map((f) => ({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `${f.label}: ${values[`field:${f.id}`] || "—"}`,
          },
        ],
      })),
    ],
  });
  const [task] = await connection.execute<DbResult>(
    "INSERT INTO tasks (project_id,status_id,name,description) VALUES (?,?,?,?) RETURNING id",
    [form.projectId, statuses[0].id, taskName, description],
  );
  await connection.execute(
    "UPDATE native_form_responses SET task_id=? WHERE id=?",
    [task.insertId, responseId],
  );
  await connection.execute(
    "INSERT INTO task_activities (task_id,user_id,activity_type,message) VALUES (?,NULL,'created',?)",
    [task.insertId, `Created from form: ${form.title}`.slice(0, 500)],
  );
  if (form.automation.whatsappEnabled) {
    values.task = taskName;
    const payload = {
      projectId: form.projectId,
      taskName,
      projectName: projects[0].name,
      workspaceName: projects[0].workspaceName,
      customText: renderFormTemplate(
        form.automation.whatsappTemplate,
        values,
      ).slice(0, 20000),
      ...(form.automation.whatsappMode === "direct"
        ? { directRecipient: form.automation.whatsappRecipient }
        : {}),
    };
    await connection.execute(
      "INSERT INTO sheet_notification_queue (task_id,payload) VALUES (?,?)",
      [task.insertId, JSON.stringify(payload)],
    );
  }
  return task.insertId;
}
