import { dataRequestHeaders } from "@/lib/data-request-fields";
import type { DataRequestRow } from "@/lib/data-request-import";

export const mappingFields = [
  ["title", "Judul task", true], ["responseId", "ID jawaban unik", false],
  ["timestamp", "Waktu jawaban", false], ["category", "Kategori project", false],
  ["name", "Nama pemohon", false], ["organization", "Nama lembaga", false],
  ["contact", "Nomor kontak", false], ["email", "Email", false],
  ["detail", "Detail kebutuhan", false],
] as const;
export type MappingField = typeof mappingFields[number][0];
export type SheetSettings = {
  mapping: Partial<Record<MappingField, string>>;
  defaultProject: string;
  template: string;
  descriptionColumns: string[];
  customMappings?: { label: string; column: string }[];
};
export function suggestSettings(headers: string[]): SheetSettings {
  const pick = (...names: string[]) => names.find(name => headers.includes(name)) || "";
  const columns = headers.filter(header => !header.startsWith("[Document Studio]") && !["Response Edit URL", "Response ID", "Tahun", "Tanggal"].includes(header));
  return {
    mapping: {
      title: pick("Nama Lengkap", "Judul", "Title", headers[0]),
      responseId: pick("Response ID"), timestamp: pick("Timestamp"),
      category: pick("Lembaga/Organisasi", "Where are you came from?"),
      name: pick("Nama Lengkap"), organization: pick("Lembaga / Organisasi"),
      contact: pick("Nomor Whatsapp/Telegram"), email: pick("Alamat Email"), detail: pick("Detail Kebutuhan Data"),
    },
    defaultProject: "Jawaban Form",
    descriptionColumns: columns,
    template: columns.map(header => `${header}: {{${header}}}`).join("\n"),
  };
}
export function validateSettings(input: unknown, headers: string[]): SheetSettings {
  if (!input || typeof input !== "object") throw new Error("Atur pemetaan kolom terlebih dahulu.");
  const settings = input as SheetSettings;
  if (!settings.mapping || typeof settings.mapping !== "object") throw new Error("Pemetaan tidak valid.");
  const mapping: SheetSettings["mapping"] = {};
  for (const [key] of mappingFields) {
    const value = settings.mapping[key];
    if (value !== undefined && typeof value !== "string") throw new Error("Pemetaan tidak valid.");
    if (value) mapping[key] = value;
  }
  if (!mapping.title) throw new Error("Pilih kolom judul task.");
  if (!mapping.responseId && !mapping.timestamp) throw new Error("Pilih ID jawaban unik atau waktu jawaban untuk mencegah task ganda.");
  if (typeof settings.defaultProject !== "string" || !settings.defaultProject.trim() || [...settings.defaultProject.trim()].length > 100) throw new Error("Nama project tujuan wajib diisi, maksimal 100 karakter.");
  if (typeof settings.template !== "string" || !settings.template.trim() || settings.template.length > 20000) throw new Error("Template pesan wajib diisi, maksimal 20.000 karakter.");
  if (!Array.isArray(settings.descriptionColumns) || !settings.descriptionColumns.length || settings.descriptionColumns.some(column => typeof column !== "string")) throw new Error("Pilih minimal satu kolom deskripsi task.");
  if (settings.customMappings !== undefined && (!Array.isArray(settings.customMappings) || settings.customMappings.length > 30)) throw new Error("Maksimal 30 pemetaan tambahan.");
  const customMappings = (settings.customMappings ?? []).map(item => {
    if (!item || typeof item.label !== "string" || typeof item.column !== "string") throw new Error("Pemetaan tambahan tidak valid.");
    const label = item.label.trim();
    if (!label || label.length > 100 || /[{}\r\n]/.test(label) || !item.column) throw new Error("Isi label dan kolom sumber pemetaan tambahan (label maksimal 100 karakter).");
    if (headers.includes(label) && label !== item.column) throw new Error(`Label ${label} sudah digunakan oleh kolom sumber lain.`);
    return { label, column: item.column };
  });
  if (new Set(customMappings.map(item => item.label.toLowerCase())).size !== customMappings.length) throw new Error("Label pemetaan tambahan harus berbeda.");
  const tokens = [...settings.template.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1].trim());
  if (settings.template.replace(/\{\{([^{}]+)\}\}/g, "").match(/\{\{|\}\}/)) throw new Error("Placeholder pesan harus berbentuk {{Nama kolom}}.");
  const missing = [...new Set([...Object.values(mapping), ...settings.descriptionColumns, ...customMappings.map(item => item.column), ...tokens.filter(token => !customMappings.some(item => item.label === token))])].filter(column => !headers.includes(column));
  if (missing.length) throw new Error(`Kolom hilang atau berubah: ${missing.join(", ")}. Petakan ulang sumber ini.`);
  return { mapping, defaultProject: settings.defaultProject.trim(), template: settings.template, descriptionColumns: [...new Set(settings.descriptionColumns)], ...(settings.customMappings !== undefined ? { customMappings } : {}) };
}
export function renderSheetMessage(template: string, row: DataRequestRow, settings?: SheetSettings) {
  const values = { ...row };
  for (const item of settings?.customMappings ?? []) values[item.label] = row[item.column] ?? "";
  return template.replace(/\{\{([^{}]+)\}\}/g, (_match, column: string) => values[column.trim()]?.trim() || "-");
}
export function mappedRow(raw: DataRequestRow, settings: SheetSettings): DataRequestRow {
  const value = (field: MappingField) => raw[settings.mapping[field] || ""] || "";
  return {
    [dataRequestHeaders.fullName]: value("name"), [dataRequestHeaders.organization]: value("organization"),
    [dataRequestHeaders.timestamp]: value("timestamp"), [dataRequestHeaders.contact]: value("contact"),
    [dataRequestHeaders.email]: value("email"), [dataRequestHeaders.detail]: value("detail"),
    [dataRequestHeaders.category]: value("category"),
  };
}
export function mappedDescription(row: DataRequestRow, settings: SheetSettings) {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const fields = [...settings.descriptionColumns.map(column => ({ label: column, column })), ...(settings.customMappings ?? []).filter(item => !settings.descriptionColumns.includes(item.label) || item.label !== item.column)];
  return fields.map(({ label, column }) => `<p><strong>${escape(label)}:</strong> ${escape(row[column] || "-").replaceAll("\n", "<br>")}</p>`).join("");
}
