"use client";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  validateAnswers,
  validateFormResponse,
  type FormDefinition,
} from "@/lib/native-form-fields";
import {
  defaultSections,
  formPath,
  nextSection,
  sectionFields,
} from "@/lib/form-sections";
import FormHeader from "@/components/form-header";
import NativeFormInputs from "@/components/native-form-inputs";
export default function FormFlow({
  form,
  onComplete,
  preview = false,
}: {
  form: FormDefinition;
  onComplete?: (
    answers: Record<string, string | string[]>,
    website: string,
    otherAnswers: Record<string, string>,
  ) => Promise<void>;
  preview?: boolean;
}) {
  const sections = form.sections ?? defaultSections(form.fields);
  const [history, setHistory] = useState<string[]>([sections[0].id]);
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const current =
    sections.find((s) => s.id === history[history.length - 1]) ?? sections[0];
  let next: string | null = null;
  try {
    next = nextSection(sections, current.id, answers);
  } catch {
    /* Shown by the submit handler. */
  }
  function focusHeading() {
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "nearest" });
    });
  }
  if (done)
    return (
      <div role="status" className="py-8 text-center">
        <CheckCircle2 size={32} className="mx-auto mb-3 text-white" />
        <p>Pratinjau selesai. Jawaban tidak disimpan.</p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setAnswers({});
            setOtherAnswers({});
            setHistory([sections[0].id]);
          }}
          className="mt-4 text-sm text-white"
        >
          Coba lagi
        </button>
      </div>
    );
  return (
    <form
      noValidate={preview}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setError("");
        try {
          if (!preview) {
            validateAnswers(
              sectionFields(current, form.fields),
              answers,
              otherAnswers,
            );
          }
          const destination = nextSection(sections, current.id, answers);
          if (destination) {
            setHistory([...history, destination]);
            focusHeading();
            return;
          }
          if (preview) {
            setDone(true);
            return;
          }
          const validated = validateFormResponse(form, answers, otherAnswers);
          setBusy(true);
          await onComplete?.(
            Object.fromEntries(
              validated.fields.map((f) => [
                f.id,
                answers[f.id] ?? (f.type === "checkbox" ? [] : ""),
              ]),
            ),
            String(new FormData(event.currentTarget).get("website") ?? ""),
            Object.fromEntries(
              validated.fields
                .filter((f) => otherAnswers[f.id] !== undefined)
                .map((f) => [f.id, otherAnswers[f.id]]),
            ),
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-introduction">
      <FormHeader
        title={form.title}
        description={current.id === sections[0].id ? form.description : ""}
        presentation={form.presentation}
      />
      {!preview && (
        <p className="text-xs font-medium text-red-500 dark:text-red-400">* Wajib diisi</p>
      )}
      </div>
      {sections.length > 1 && current.id !== sections[0].id && (
        <div className="mb-6">
          <p className="mb-2 text-xs opacity-50">
            Halaman {sections.findIndex((s) => s.id === current.id) + 1} dari{" "}
            {sections.length}
          </p>
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            {current.title}
          </h2>
          {current.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm opacity-60">
              {current.description}
            </p>
          )}
        </div>
      )}
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <fieldset disabled={busy}>
        <NativeFormInputs
          fields={sectionFields(current, form.fields)}
          answers={answers}
          otherAnswers={otherAnswers}
          onOtherChange={(id, value) =>
            setOtherAnswers((current) => ({ ...current, [id]: value }))
          }
          onChange={(id, value) => {
            const updated = { ...answers, [id]: value };
            try {
              const allowed = new Set(
                formPath(sections, updated).flatMap((s) => s.fieldIds),
              );
              setOtherAnswers((current) =>
                Object.fromEntries(
                  Object.entries(current).filter(([key]) => allowed.has(key)),
                ),
              );
              setAnswers(
                Object.fromEntries(
                  Object.entries(updated).filter(([key]) => allowed.has(key)),
                ),
              );
            } catch {
              setAnswers(updated);
            }
            setError("");
          }}
        />
      </fieldset>
      {error && (
        <p role="alert" className="mt-5 text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="mt-8 flex items-center justify-between gap-3">
        {history.length > 1 ? (
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-current/20 px-4 py-3 text-sm disabled:opacity-40"
            onClick={() => {
              setHistory(history.slice(0, -1));
              setError("");
              focusHeading();
            }}
          >
            <ArrowLeft size={16} />
            Kembali
          </button>
        ) : (
          <span />
        )}
        <button
          disabled={busy}
          type="submit"
          className={`inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold disabled:opacity-40 ${preview ? "form-save-button bg-white text-zinc-950 hover:bg-zinc-200" : "bg-zinc-900 text-white hover:bg-zinc-800"}`}
        >
          {busy
            ? "Mengirim…"
            : next
              ? "Berikutnya"
              : preview
                ? "Selesai pratinjau"
                : "Kirim jawaban"}
          {next && <ArrowRight size={16} />}
        </button>
      </div>
    </form>
  );
}
