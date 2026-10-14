"use client";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import type { FormField } from "@/lib/native-form-fields";
import { OTHER_OPTION } from "@/lib/form-choice-values";
export default function NativeFormInputs({
  fields,
  answers,
  onChange,
  otherAnswers = {},
  onOtherChange,
}: {
  fields: FormField[];
  answers: Record<string, string | string[]>;
  onChange: (id: string, value: string | string[]) => void;
  otherAnswers?: Record<string, string>;
  onOtherChange?: (id: string, value: string) => void;
}) {
  const input =
    "w-full rounded-xl border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current focus:ring-2 focus:ring-current/20";
  function optionImage(f: FormField, option: string) {
    const image = f.optionImages?.find((i) => i.value === option);
    return image ? (
      <Image
        unoptimized
        src={`/api/form-images/${image.imageId}`}
        width={480}
        height={320}
        alt={option}
        className="mt-3 max-h-48 w-full rounded-lg object-contain"
      />
    ) : null;
  }
  return (
    <div className="space-y-6">
      {fields.map((f) => {
        const selectedOther =
          f.type === "checkbox"
            ? Array.isArray(answers[f.id]) &&
              answers[f.id].includes(OTHER_OPTION)
            : answers[f.id] === OTHER_OPTION;
        const options = [...f.options, ...(f.allowOther ? [OTHER_OPTION] : [])];
        const describedBy = f.description ? `description-${f.id}` : undefined;
        return (
          <div
            key={f.id}
            className="form-question-card rounded-xl border border-current/15 p-4 sm:p-5"
          >
            <label
              id={`label-${f.id}`}
              htmlFor={`field-${f.id}`}
              className="mb-2 block text-sm font-medium"
            >
              {f.label}{" "}
              {f.required && <span className="ml-0.5 text-red-500 dark:text-red-400">*</span>}
            </label>
            {f.description && (
              <p
                id={describedBy}
                className="mb-3 whitespace-pre-wrap break-words text-sm opacity-60"
              >
                {f.description}
              </p>
            )}
            {f.type === "radio" || f.type === "checkbox" ? (
              <fieldset
                aria-labelledby={`label-${f.id}`}
                aria-describedby={describedBy}
                className="space-y-2"
              >
                <p className="text-xs opacity-50">
                  {f.type === "radio"
                    ? "Pilih satu jawaban."
                    : "Bisa pilih lebih dari satu jawaban."}
                </p>
                {options.map((option, index) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-current/10 p-3 text-sm has-[:checked]:border-current/70 has-[:checked]:bg-current/5"
                  >
                    <input
                      id={index === 0 ? `field-${f.id}` : undefined}
                      type={f.type}
                      name={`field-${f.id}`}
                      value={option}
                      required={f.type === "radio" && f.required}
                      className="mt-1 shrink-0 accent-current"
                      checked={
                        f.type === "radio"
                          ? answers[f.id] === option
                          : Array.isArray(answers[f.id]) &&
                            answers[f.id].includes(option)
                      }
                      onChange={(event) => {
                        if (f.type === "radio") onChange(f.id, option);
                        else {
                          const previous = Array.isArray(answers[f.id])
                            ? (answers[f.id] as string[])
                            : [];
                          onChange(
                            f.id,
                            event.target.checked
                              ? [...previous, option]
                              : previous.filter((v) => v !== option),
                          );
                        }
                      }}
                    />
                    <span className="min-w-0 flex-1 break-words">
                      {option === OTHER_OPTION ? "Lainnya" : option}
                      {option !== OTHER_OPTION && optionImage(f, option)}
                    </span>
                  </label>
                ))}
                {f.type === "radio" && !f.required && answers[f.id] && (
                  <button
                    type="button"
                    className="text-xs opacity-60 hover:opacity-100"
                    onClick={() => onChange(f.id, "")}
                  >
                    Kosongkan pilihan
                  </button>
                )}
              </fieldset>
            ) : f.type === "select" ? (
              <div>
                <div className="relative">
                  <select
                    id={`field-${f.id}`}
                    aria-describedby={describedBy}
                    className={`${input} appearance-none pr-10 cursor-pointer`}
                    required={f.required}
                    value={typeof answers[f.id] === "string" ? answers[f.id] : ""}
                    onChange={(e) => onChange(f.id, e.target.value)}
                  >
                    <option value="">
                      Pilih jawaban
                    </option>
                    {options.map((o) => (
                      <option
                        key={o}
                        value={o}
                      >
                        {o === OTHER_OPTION ? "Lainnya" : o}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-4 opacity-50" />
                </div>
                {typeof answers[f.id] === "string" &&
                  optionImage(f, answers[f.id] as string)}
              </div>
            ) : f.type === "textarea" ? (
              <textarea
                id={`field-${f.id}`}
                aria-describedby={describedBy}
                className={input}
                rows={4}
                required={f.required}
                maxLength={10000}
                value={String(answers[f.id] ?? "")}
                onChange={(e) => onChange(f.id, e.target.value)}
              />
            ) : (
              <input
                id={`field-${f.id}`}
                aria-describedby={describedBy}
                className={input}
                type={f.type}
                step={f.type === "number" ? "any" : undefined}
                required={f.required}
                maxLength={10000}
                value={String(answers[f.id] ?? "")}
                onChange={(e) => onChange(f.id, e.target.value)}
              />
            )}
            {selectedOther && (
              <label className="mt-3 block text-sm">
                Jawaban lainnya <span className="ml-0.5 text-red-500 dark:text-red-400">*</span>
                <input
                  aria-label={`Jawaban lainnya untuk ${f.label}`}
                  className={`${input} mt-2`}
                  placeholder="Tulis jawabanmu…"
                  required
                  maxLength={2000}
                  value={otherAnswers[f.id] ?? ""}
                  onChange={(e) => onOtherChange?.(f.id, e.target.value)}
                />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
