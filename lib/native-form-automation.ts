import type { FormField } from "@/lib/native-form-fields";
export type FormAutomation = {
  taskTitle: string;
  whatsappEnabled: boolean;
  whatsappMode: "groups" | "direct";
  whatsappRecipient: string;
  whatsappTemplate: string;
};
export const defaultAutomation: FormAutomation = {
  taskTitle: "{{form}} #{{response_id}}",
  whatsappEnabled: false,
  whatsappMode: "groups",
  whatsappRecipient: "",
  whatsappTemplate:
    "*{{task}}*\nProject: {{project}}\n\n{{answers}}\n\n{{task_url}}",
};
export function validateAutomation(
  value: unknown,
  fields: FormField[],
  projectId: number | null,
): FormAutomation {
  if (value === undefined || value === null) return { ...defaultAutomation };
  if (typeof value !== "object")
    throw new Error("Pengaturan otomatis tidak valid.");
  const a = value as FormAutomation;
  if (
    typeof a.whatsappEnabled !== "boolean" ||
    !["groups", "direct"].includes(a.whatsappMode)
  )
    throw new Error("Pengaturan WhatsApp tidak valid.");
  if (
    typeof a.whatsappRecipient !== "string" ||
    a.whatsappRecipient.length > 30
  )
    throw new Error("Nomor WhatsApp tidak valid.");
  if (a.whatsappEnabled && !projectId)
    throw new Error("Pilih project sebelum mengaktifkan WhatsApp.");
  if (
    a.whatsappEnabled &&
    a.whatsappMode === "direct" &&
    !/^\+?[0-9]{8,15}$/.test(a.whatsappRecipient.trim())
  )
    throw new Error("Isi nomor WhatsApp tujuan, misalnya 628123456789.");
  const allowed = new Set([
    "form",
    "response_id",
    "project",
    "workspace",
    "task",
    "answers",
    "task_url",
    ...fields.map((f) => `field:${f.id}`),
  ]);
  for (const [name, template, limit] of [
    ["Judul task", a.taskTitle, 500],
    ["Pesan WhatsApp", a.whatsappTemplate, 10000],
  ] as const) {
    if (
      typeof template !== "string" ||
      !template.trim() ||
      template.length > limit
    )
      throw new Error(`${name} wajib diisi, maksimal ${limit} karakter.`);
    for (const match of template.matchAll(/{{\s*([^{}]+?)\s*}}/g))
      if (!allowed.has(match[1]))
        throw new Error(
          `Variabel ${match[0]} tidak dikenal. Pilih variabel dari pertanyaan yang tersedia.`,
        );
  }
  return {
    taskTitle: a.taskTitle.trim(),
    whatsappEnabled: a.whatsappEnabled,
    whatsappMode: a.whatsappMode,
    whatsappRecipient: a.whatsappRecipient.trim(),
    whatsappTemplate: a.whatsappTemplate.trim(),
  };
}
export function renderFormTemplate(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(
    /{{\s*([^{}]+?)\s*}}/g,
    (_match, key: string) => values[key] ?? "",
  );
}
export function formAnswerText(
  fields: FormField[],
  answers: Record<string, string | string[]>,
) {
  return fields
    .map(
      (f) =>
        `${f.label}: ${Array.isArray(answers[f.id]) ? (answers[f.id] as string[]).join(", ") : answers[f.id] || "—"}`,
    )
    .join("\n");
}
