import { OTHER_OPTION } from "@/lib/form-choice-values";
import type { FormField } from "@/lib/native-form-fields";
export type SectionTarget = string;
export type FormSection = {
  id: string;
  title: string;
  description: string;
  fieldIds: string[];
  next: SectionTarget;
  branch: {
    fieldId: string;
    routes: { answer: string; target: SectionTarget }[];
  } | null;
};
export function defaultSections(fields: FormField[]): FormSection[] {
  return [
    {
      id: "first-page",
      title: "Halaman 1",
      description: "",
      fieldIds: fields.map((f) => f.id),
      next: "next",
      branch: null,
    },
  ];
}
export function sectionFields(section: FormSection, fields: FormField[]) {
  return fields.filter((f) => section.fieldIds.includes(f.id));
}
export function validateSections(
  value: unknown,
  fields: FormField[],
): FormSection[] {
  if (value === undefined || value === null) return defaultSections(fields);
  if (!Array.isArray(value) || !value.length || value.length > 20)
    throw new Error("Form harus memiliki 1–20 halaman.");
  const sectionIds = new Set<string>();
  const assigned = new Set<string>();
  const sections = value.map((raw): FormSection => {
    if (!raw || typeof raw !== "object")
      throw new Error("Halaman tidak valid.");
    const s = raw as FormSection;
    if (
      typeof s.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(s.id) ||
      ["next", "submit"].includes(s.id) ||
      sectionIds.has(s.id)
    )
      throw new Error("ID halaman tidak valid atau duplikat.");
    sectionIds.add(s.id);
    if (
      typeof s.title !== "string" ||
      !s.title.trim() ||
      s.title.length > 200 ||
      typeof s.description !== "string" ||
      s.description.length > 2000
    )
      throw new Error(
        "Judul halaman wajib diisi (maks. 200 karakter), deskripsi maks. 2.000 karakter.",
      );
    if (
      !Array.isArray(s.fieldIds) ||
      s.fieldIds.some(
        (id) =>
          typeof id !== "string" ||
          !fields.some((f) => f.id === id) ||
          assigned.has(id) ||
          (assigned.add(id), false),
      )
    )
      throw new Error("Setiap pertanyaan harus berada tepat di satu halaman.");
    return {
      id: s.id,
      title: s.title.trim(),
      description: s.description.trim(),
      fieldIds: s.fieldIds,
      next: s.next ?? "next",
      branch: s.branch ?? null,
    };
  });
  if (assigned.size !== fields.length)
    throw new Error("Ada pertanyaan yang belum ditempatkan di halaman.");
  sections.forEach((s, index) => {
    const validTarget = (target: unknown) =>
      typeof target === "string" &&
      (target === "next" ||
        target === "submit" ||
        sections.findIndex((page) => page.id === target) > index);
    if (!validTarget(s.next))
      throw new Error(
        `Tujuan ${s.title} harus ke halaman sesudahnya atau kirim form.`,
      );
    if (s.branch) {
      const f = fields.find(
        (f) => f.id === s.branch?.fieldId && s.fieldIds.includes(f.id),
      );
      if (
        !f ||
        !["select", "radio"].includes(f.type) ||
        !Array.isArray(s.branch.routes) ||
        s.branch.routes.length > 100
      )
        throw new Error(
          `Percabangan ${s.title} harus memakai dropdown atau pilihan tunggal di halaman ini.`,
        );
      const choices = new Set<string>();
      s.branch = {
        fieldId: f.id,
        routes: s.branch.routes.map((r) => {
          if (
            !r ||
            typeof r.answer !== "string" ||
            (!f.options.includes(r.answer) &&
              !(f.allowOther && r.answer === OTHER_OPTION)) ||
            choices.has(r.answer) ||
            !validTarget(r.target)
          )
            throw new Error(
              `Aturan percabangan ${s.title} tidak valid. Periksa jawaban dan halaman tujuan.`,
            );
          choices.add(r.answer);
          return { answer: r.answer, target: r.target };
        }),
      };
    }
  });
  return sections;
}
export function nextSection(
  sections: FormSection[],
  currentId: string,
  answers: Record<string, string | string[]>,
): string | null {
  const index = sections.findIndex((s) => s.id === currentId);
  const section = sections[index];
  if (!section) throw new Error("Halaman form tidak ditemukan.");
  const answer = section.branch ? answers[section.branch.fieldId] : undefined;
  const target =
    section.branch?.routes.find((r) => r.answer === answer)?.target ??
    section.next;
  if (target === "submit") return null;
  if (target === "next") return sections[index + 1]?.id ?? null;
  if (sections.findIndex((s) => s.id === target) <= index)
    throw new Error(
      "Tujuan percabangan tidak valid. Periksa pengaturan halaman.",
    );
  return target;
}
export function formPath(
  sections: FormSection[],
  answers: Record<string, string | string[]>,
) {
  const path: FormSection[] = [];
  let id: string | null = sections[0]?.id ?? null;
  while (id) {
    const section = sections.find((s) => s.id === id);
    if (!section || path.length >= sections.length)
      throw new Error("Alur halaman tidak valid.");
    path.push(section);
    id = nextSection(sections, id, answers);
  }
  return path;
}
