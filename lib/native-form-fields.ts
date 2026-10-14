import { OTHER_OPTION } from "@/lib/form-choice-values";
import {
  defaultSections,
  nextSection,
  sectionFields,
  validateSections,
  type FormSection,
} from "@/lib/form-sections";
import {
  validatePresentation,
  richDocText,
  type FormPresentation,
} from "@/lib/form-presentation";
export const fieldTypes = {
  text: "Jawaban singkat",
  textarea: "Paragraf",
  email: "Email",
  number: "Angka",
  date: "Tanggal",
  select: "Dropdown (1 jawaban)",
  radio: "Pilihan tunggal (1 jawaban)",
  checkbox: "Pilihan multiple (lebih dari 1)",
} as const;
export type FormField = {
  allowOther?: boolean;
  optionImages?: { value: string; imageId: string }[];
  description?: string;
  id: string;
  label: string;
  type: keyof typeof fieldTypes;
  required: boolean;
  options: string[];
};
export type FormDefinition = {
  sections?: FormSection[];
  presentation?: FormPresentation;
  title: string;
  description: string;
  fields: FormField[];
  isPublished: boolean;
};
export function validateDefinition(input: unknown): FormDefinition {
  if (!input || typeof input !== "object")
    throw new Error("Data form tidak valid.");
  const body = { ...(input as Record<string, unknown>) };
  const presentation = validatePresentation(body.presentation);
  if (presentation.titleDoc) body.title = richDocText(presentation.titleDoc);
  if (presentation.descriptionDoc)
    body.description = richDocText(presentation.descriptionDoc);
  if (
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.length > 200
  )
    throw new Error("Judul wajib diisi, maksimal 200 karakter.");
  if (typeof body.description !== "string" || body.description.length > 5000)
    throw new Error("Deskripsi maksimal 5.000 karakter.");
  if (typeof body.isPublished !== "boolean")
    throw new Error("Status form tidak valid.");
  if (
    !Array.isArray(body.fields) ||
    body.fields.length < 1 ||
    body.fields.length > 50
  )
    throw new Error("Tambahkan 1–50 pertanyaan.");
  const ids = new Set<string>();
  const fields = body.fields.map((value): FormField => {
    if (!value || typeof value !== "object")
      throw new Error("Pertanyaan tidak valid.");
    const f = value as Record<string, unknown>;
    if (
      typeof f.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(f.id) ||
      ids.has(f.id)
    )
      throw new Error("ID pertanyaan tidak valid atau duplikat.");
    ids.add(f.id);
    if (typeof f.label !== "string" || !f.label.trim() || f.label.length > 500)
      throw new Error("Label pertanyaan wajib diisi, maksimal 500 karakter.");
    if (
      typeof f.type !== "string" ||
      !Object.hasOwn(fieldTypes, f.type) ||
      typeof f.required !== "boolean"
    )
      throw new Error("Jenis pertanyaan tidak valid.");
    if (
      f.description !== undefined &&
      (typeof f.description !== "string" || f.description.length > 2000)
    )
      throw new Error("Deskripsi pertanyaan maksimal 2.000 karakter.");
    let options: string[] = [];
    if (f.type === "select" || f.type === "radio" || f.type === "checkbox") {
      if (
        !Array.isArray(f.options) ||
        f.options.length > 100 ||
        f.options.some((o) => typeof o !== "string" || o.length > 200)
      )
        throw new Error("Pilihan tidak valid.");
      options = [
        ...new Set(
          (f.options as string[]).map((o) => o.trim()).filter(Boolean),
        ),
      ];
      if (!options.length && !f.allowOther)
        throw new Error("Isi minimal satu pilihan.");
      if (options.length !== f.options.length)
        throw new Error("Setiap opsi harus diisi dan tidak boleh sama.");
    }
    if (f.allowOther !== undefined && typeof f.allowOther !== "boolean")
      throw new Error("Pengaturan Lainnya tidak valid.");
    const choice = ["select", "radio", "checkbox"].includes(String(f.type));
    if (options.includes(OTHER_OPTION))
      throw new Error("Teks opsi ini tidak dapat digunakan.");
    let optionImages: { value: string; imageId: string }[] = [];
    if (choice && f.optionImages !== undefined) {
      if (!Array.isArray(f.optionImages) || f.optionImages.length > 100)
        throw new Error("Gambar opsi tidak valid.");
      const seen = new Set<string>();
      optionImages = f.optionImages.map((item) => {
        if (
          !item ||
          typeof item.value !== "string" ||
          !options.includes(item.value.trim()) ||
          seen.has(item.value.trim()) ||
          typeof item.imageId !== "string" ||
          !/^[0-9a-f-]{36}$/.test(item.imageId)
        )
          throw new Error("Gambar harus terhubung ke satu opsi yang valid.");
        seen.add(item.value.trim());
        return { value: item.value.trim(), imageId: item.imageId };
      });
    }
    return {
      ...(choice && f.allowOther ? { allowOther: true } : {}),
      ...(optionImages.length ? { optionImages } : {}),
      ...(typeof f.description === "string"
        ? { description: f.description.trim() }
        : {}),
      id: f.id,
      label: f.label.trim(),
      type: f.type as FormField["type"],
      required: f.required,
      options,
    };
  });
  return {
    sections: validateSections(body.sections, fields),
    presentation,
    title: body.title.trim(),
    description: body.description.trim(),
    fields,
    isPublished: body.isPublished,
  };
}
export function validateAnswers(
  fields: FormField[],
  input: unknown,
  otherInput: unknown = {},
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Jawaban tidak valid.");
  const values = input as Record<string, unknown>;
  function otherText(field: FormField) {
    const text =
      otherInput && typeof otherInput === "object" && !Array.isArray(otherInput)
        ? (otherInput as Record<string, unknown>)[field.id]
        : undefined;
    if (
      !field.allowOther ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 2000
    )
      throw new Error(
        `Isi jawaban Lainnya untuk ${field.label} (maks. 2.000 karakter).`,
      );
    return `Lainnya: ${text.trim()}`;
  }
  const answers: Record<string, string | string[]> = {};
  for (const f of fields) {
    const raw = values[f.id] ?? (f.type === "checkbox" ? [] : "");
    if (f.type === "checkbox") {
      if (
        !Array.isArray(raw) ||
        raw.length > f.options.length + (f.allowOther ? 1 : 0) ||
        raw.some(
          (v) =>
            typeof v !== "string" ||
            (!f.options.includes(v) && !(f.allowOther && v === OTHER_OPTION)),
        )
      )
        throw new Error(`Pilihan ${f.label} tidak valid.`);
      const selected = [...new Set(raw as string[])];
      if (f.required && !selected.length)
        throw new Error(`${f.label} wajib diisi.`);
      answers[f.id] = selected.map((value) =>
        value === OTHER_OPTION ? otherText(f) : value,
      );
    } else {
      if (typeof raw !== "string" || raw.length > 10000)
        throw new Error(`Jawaban ${f.label} tidak valid atau terlalu panjang.`);
      const value = raw.trim();
      if (f.required && !value) throw new Error(`${f.label} wajib diisi.`);
      if (
        value &&
        f.type === "email" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      )
        throw new Error(`Email ${f.label} tidak valid.`);
      if (value && f.type === "number" && !Number.isFinite(Number(value)))
        throw new Error(`${f.label} harus berupa angka.`);
      if (
        value &&
        f.type === "date" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value)
      )
        throw new Error(`${f.label} harus berupa tanggal valid.`);
      if (
        value &&
        (f.type === "select" || f.type === "radio") &&
        !f.options.includes(value) &&
        !(f.allowOther && value === OTHER_OPTION)
      )
        throw new Error(`Pilihan ${f.label} tidak valid.`);
      answers[f.id] =
        ["select", "radio"].includes(f.type) && value === OTHER_OPTION
          ? otherText(f)
          : value;
    }
  }
  return answers;
}

export function validateFormResponse(
  form: { fields: FormField[]; sections?: FormSection[] },
  input: unknown,
  otherInput: unknown = {},
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Jawaban tidak valid.");
  const sections = validateSections(
    form.sections ?? defaultSections(form.fields),
    form.fields,
  );
  const answers: Record<string, string | string[]> = {};
  const fields: FormField[] = [];
  const path: string[] = [];
  let current: string | null = sections[0].id;
  while (current) {
    const section = sections.find((s) => s.id === current)!;
    if (path.includes(current)) throw new Error("Alur halaman tidak valid.");
    const pageFields = sectionFields(section, form.fields);
    Object.assign(answers, validateAnswers(pageFields, input, otherInput));
    fields.push(...pageFields);
    path.push(current);
    const routing = { ...answers };
    if (
      section.branch &&
      (input as Record<string, unknown>)[section.branch.fieldId] ===
        OTHER_OPTION
    )
      routing[section.branch.fieldId] = OTHER_OPTION;
    current = nextSection(sections, current, routing);
  }
  return { answers, fields, path };
}

export type FieldSummary = {
  fieldId: string;
  label: string;
  type: string;
  totalAnswered: number;
  options?: {
    label: string;
    count: number;
    percentage: number;
  }[];
  otherCount?: number;
  otherAnswers?: string[];
  numberStats?: {
    count: number;
    avg: number;
    min: number;
    max: number;
    sum: number;
    recentValues: number[];
  };
  textAnswers?: {
    value: string;
    count: number;
  }[];
};

