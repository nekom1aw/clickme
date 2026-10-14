import "server-only";

import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { sendWahaText } from "@/lib/waha";
import { ensureWhatsappGroupConnectionSchema } from "@/lib/whatsapp-group-connections";

export type TaskCreatedNotification = {
  deliveryKey?: number;
  directRecipient?: string;
  customText?: string;
  projectId: number;
  taskName: string;
  projectName: string;
  workspaceName: string;
  requesterName?: string;
  description?: string | null;
  dueDate?: string | Date | null;
  priority?: string | null;
  assigneeIds?: number[];
  tags?: string[];
  monitoringPath?: string;
  useLegacyFallback?: boolean;
};

export type TaskNotificationResult =
  | { status: "sent"; recipientCount: number }
  | { status: "skipped"; reason: "group_not_configured" };

type ConnectedGroupRow = DbRow & {
  group_chat_id: string;
};

type AssigneeRow = DbRow & {
  id: number;
  name: string;
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function extractStructuredText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(extractStructuredText).join("");
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const node = value as {
    type?: string;
    text?: string;
    content?: unknown[];
  };
  const blockTypes = new Set([
    "paragraph",
    "heading",
    "blockquote",
    "codeBlock",
    "listItem",
  ]);
  const prefix = node.type === "listItem" ? "- " : "";
  const content = node.content?.map(extractStructuredText).join("") ?? "";
  const suffix = node.type && blockTypes.has(node.type) ? "\n" : "";

  return `${prefix}${node.text ?? ""}${content}${suffix}`;
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function formatDescription(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) {
    return "-";
  }

  let text = "";
  try {
    text = extractStructuredText(JSON.parse(raw));
  } catch {
    text = raw
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
  }

  return (
    decodeBasicHtmlEntities(text)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim() || "-"
  );
}

async function getAssigneeNames(assigneeIds: number[] | undefined) {
  const ids = [...new Set((assigneeIds ?? []).filter(Number.isFinite))];
  if (!ids.length) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await db.query<AssigneeRow[]>(
    `SELECT id, name FROM users WHERE id IN (${placeholders})`,
    ids,
  );
  const namesById = new Map(rows.map((row) => [Number(row.id), row.name]));

  return ids
    .map((id) => namesById.get(id)?.trim())
    .filter((name): name is string => Boolean(name));
}

function monitoringUrl(path: string | undefined) {
  if (!path) {
    return "";
  }

  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return appUrl ? `${appUrl}${path}` : path;
}

export async function notifyTaskCreatedToWhatsappGroup({
  deliveryKey,
  directRecipient,
  customText,
  projectId,
  taskName,
  description,
  dueDate,
  priority,
  assigneeIds,
  tags,
  monitoringPath,
  useLegacyFallback = false,
}: TaskCreatedNotification): Promise<TaskNotificationResult> {
  await ensureWhatsappGroupConnectionSchema();

  const [rows] = await db.query<ConnectedGroupRow[]>(
    `SELECT DISTINCT connected.group_chat_id
     FROM (
       SELECT group_chat_id
       FROM whatsapp_group_connections
       WHERE scope_type = 'project'
         AND scope_id = ?
         AND group_chat_id IS NOT NULL
       UNION
       SELECT whatsapp_group_connections.group_chat_id
       FROM whatsapp_group_connections
       INNER JOIN projects
         ON projects.workspace_id = whatsapp_group_connections.scope_id
       WHERE whatsapp_group_connections.scope_type = 'workspace'
         AND projects.id = ?
         AND whatsapp_group_connections.group_chat_id IS NOT NULL
     ) AS connected`,
    [projectId, projectId],
  );

  const recipients = rows
    .map((row) => row.group_chat_id?.trim())
    .filter((groupId): groupId is string => Boolean(groupId));
  const legacyGroupId = process.env.WAHA_TASK_GROUP_ID?.trim();

  if (!recipients.length && useLegacyFallback && legacyGroupId) {
    recipients.push(legacyGroupId);
  }

  const uniqueRecipients = directRecipient ? [directRecipient] : [...new Set(recipients)];

  if (!uniqueRecipients.length) {
    return { status: "skipped", reason: "group_not_configured" };
  }

  const link = monitoringUrl(monitoringPath);
  const assigneeNames = await getAssigneeNames(assigneeIds);
  const cleanTaskName = taskName.replace(/\*/g, "").trim() || "Task baru";
  const cleanTags = (tags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(", ");
  const lines = customText ? [customText] : [
    `*${cleanTaskName}*`,
    "",
    "Deskripsi:",
    formatDescription(description),
    "",
    `Due date: ${formatDate(dueDate)}`,
    `Priority: ${priority?.trim() || "-"}`,
    `Assignee: ${assigneeNames.join(", ") || "-"}`,
    `Tag: ${cleanTags || "-"}`,
  ];

  if (link) {
    lines.push("", `Monitoring: ${link}`);
  }

  for (const recipient of uniqueRecipients) {
    if (deliveryKey) {
      const [sent] = await db.query<DbRow[]>(
        "SELECT task_id FROM sheet_notification_deliveries WHERE task_id = ? AND recipient = ?",
        [deliveryKey, recipient],
      );
      if (sent.length) continue;
    }
    await sendWahaText({ recipient, text: lines.join("\n") });
    if (deliveryKey) {
      await db.execute("INSERT INTO sheet_notification_deliveries (task_id, recipient) VALUES (?, ?) ON CONFLICT DO NOTHING", [deliveryKey, recipient]);
    }
  }

  return { status: "sent", recipientCount: uniqueRecipients.length };
}
