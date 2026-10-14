"use client";
import { OTHER_OPTION } from "@/lib/form-choice-values";
import { Trash2 } from "lucide-react";
import type { FormField } from "@/lib/native-form-fields";
import type { FormSection } from "@/lib/form-sections";
const input =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white";
export default function FormSectionSettings({
  section,
  index,
  sections,
  fields,
  onChange,
  onRemove,
}: {
  section: FormSection;
  index: number;
  sections: FormSection[];
  fields: FormField[];
  onChange: (section: FormSection) => void;
  onRemove: () => void;
}) {
  const choices = fields.filter(
    (f) =>
      section.fieldIds.includes(f.id) && ["select", "radio"].includes(f.type),
  );
  const branching = choices.find((f) => f.id === section.branch?.fieldId);
  const targets = (
    <>
      <option className="bg-zinc-900" value="next">
        Lanjut berurutan
      </option>
      {sections.slice(index + 1).map((s, i) => (
        <option className="bg-zinc-900" key={s.id} value={s.id}>
          Halaman {index + i + 2}: {s.title}
        </option>
      ))}
      <option className="bg-zinc-900" value="submit">
        Kirim form
      </option>
    </>
  );
  return (
    <div className="rounded-xl border border-white/25 bg-white/[0.07] p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-white">
          Halaman {index + 1} dari {sections.length}
        </span>
        {sections.length > 1 && (
          <button
            type="button"
            aria-label={`Hapus pemisah halaman ${index + 1}`}
            title="Gabungkan pertanyaan ke halaman lain"
            onClick={onRemove}
            className="rounded p-2 text-white/40 hover:text-red-300"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <label className="block text-xs text-white/50">
        Judul halaman
        <input
          className={`${input} mt-2`}
          value={section.title}
          maxLength={200}
          onChange={(e) => onChange({ ...section, title: e.target.value })}
        />
      </label>
      <label className="mt-3 block text-xs text-white/50">
        Deskripsi halaman
        <textarea
          className={`${input} mt-2`}
          value={section.description}
          maxLength={2000}
          rows={2}
          onChange={(e) =>
            onChange({ ...section, description: e.target.value })
          }
        />
      </label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-white/50">
          Setelah halaman ini
          <select
            className={`${input} mt-2`}
            value={section.next}
            onChange={(e) => onChange({ ...section, next: e.target.value })}
          >
            {targets}
          </select>
        </label>
        <label className="text-xs text-white/50">
          Lompat berdasarkan jawaban
          <select
            className={`${input} mt-2`}
            value={section.branch?.fieldId ?? ""}
            onChange={(e) =>
              onChange({
                ...section,
                branch: e.target.value
                  ? { fieldId: e.target.value, routes: [] }
                  : null,
              })
            }
          >
            <option className="bg-zinc-900" value="">
              Tidak menggunakan percabangan
            </option>
            {choices.map((f) => (
              <option className="bg-zinc-900" key={f.id} value={f.id}>
                {f.label || "Pertanyaan tanpa judul"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/35">
        Percabangan berlaku setelah menekan Berikutnya. Gunakan satu pertanyaan
        dropdown atau pilihan tunggal sebagai penentu halaman. Tujuan hanya ke
        halaman sesudahnya atau kirim form.
      </p>
      {branching && (
        <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
          {[
            ...new Set([
              ...branching.options.map((o) => o.trim()).filter(Boolean),
              ...(branching.allowOther ? [OTHER_OPTION] : []),
            ]),
          ].map((answer) => (
            <label
              key={answer}
              className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center"
            >
              <span className="min-w-0 flex-1 break-words text-white/65">
                Jika memilih{" "}
                <strong>{answer === OTHER_OPTION ? "Lainnya" : answer}</strong>
              </span>
              <select
                aria-label={`Tujuan jawaban ${answer === OTHER_OPTION ? "Lainnya" : answer}`}
                className={`${input} sm:w-64`}
                value={
                  section.branch?.routes.find((r) => r.answer === answer)
                    ?.target ?? ""
                }
                onChange={(e) =>
                  onChange({
                    ...section,
                    branch: {
                      fieldId: branching.id,
                      routes: [
                        ...(section.branch?.routes ?? []).filter(
                          (r) => r.answer !== answer,
                        ),
                        ...(e.target.value
                          ? [{ answer, target: e.target.value }]
                          : []),
                      ],
                    },
                  })
                }
              >
                <option className="bg-zinc-900" value="">
                  Ikuti pengaturan halaman
                </option>
                {targets}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
