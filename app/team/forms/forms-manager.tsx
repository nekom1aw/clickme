"use client";
import { createClientId } from "@/lib/client-id";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  FileText,
  ListOrdered,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  type FieldSummary,
  type FormDefinition,
  type FormField,
  validateDefinition,
} from "@/lib/native-form-fields";

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Jawaban singkat",
  textarea: "Paragraf",
  email: "Email",
  number: "Angka",
  date: "Tanggal",
  select: "Dropdown",
  radio: "Pilihan ganda",
  checkbox: "Kotak centang",
};

const OPTION_BAR_COLORS = [
  "bg-current",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-teal-500",
  "bg-current",
  "bg-orange-500",
];
import { OTHER_OPTION } from "@/lib/form-choice-values";
import FormChoiceEditor from "@/components/form-choice-editor";
import FormQuestionFooter from "@/components/form-question-footer";
import FormHeaderEditor from "@/components/form-header-editor";
import FormFieldTypePicker from "@/components/form-field-type-picker";
import FormAutomationSettings from "@/components/form-automation-settings";
import {
  defaultAutomation,
  validateAutomation,
  type FormAutomation,
} from "@/lib/native-form-automation";
import FormFlow from "@/components/form-flow";
import FormSectionSettings from "@/components/form-section-settings";
import { defaultSections, type FormSection } from "@/lib/form-sections";
type Summary = {
  id: number;
  workspaceId: number | null;
  projectId: number | null;
  token: string;
  title: string;
  description: string;
  isPublished: boolean;
  responseCount: number;
};
type Editor = FormDefinition & {
  automation: FormAutomation;
  id?: number;
  token?: string;
  workspaceId: number | null;
  projectId: number | null;
};
type Reply = {
  taskId: number | null;
  projectSlug: string | null;
  notificationSentAt: string | null;
  notificationAttempts: number | null;
  id: number;
  createdAt: string;
  fields: FormField[];
  answers: Record<string, string | string[]>;
};
const input =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white";
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm transition hover:bg-white/10 disabled:opacity-40";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-white text-zinc-950 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-200 disabled:opacity-40";
function field(): FormField {
  return {
    id: createClientId(),
    label: "",
    type: "text",
    required: false,
    options: [],
  };
}
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Permintaan gagal.");
  return data;
}
export default function FormsManager({
  initialFormId,
  createNew = false,
}: {
  initialFormId?: number;
  createNew?: boolean;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<
    { id: number; name: string; workspaceId: number }[]
  >([]);
  const [forms, setForms] = useState<Summary[]>([]);
  const [workspaces, setWorkspaces] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [workspaceId, setWorkspaceId] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [tab, setTab] = useState<"edit" | "preview" | "responses" | "settings">(
    "edit",
  );
  const [responses, setResponses] = useState<Reply[]>([]);
  const [responseSubTab, setResponseSubTab] = useState<"summary" | "individual">("summary");
  const [totalResponses, setTotalResponses] = useState(0);
  const [summary, setSummary] = useState<FieldSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [headerUploading, setHeaderUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function reload() {
    const data = await api("/api/forms");
    setForms(data.forms);
    setWorkspaces(data.workspaces);
    setProjects(data.projects);
    window.dispatchEvent(new Event("clickme-forms-updated"));
    return data;
  }
  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const data = await api("/api/forms");
        if (!active) return;
        setForms(data.forms);
        setWorkspaces(data.workspaces);
        setProjects(data.projects);
        const requested = Number(
          new URLSearchParams(window.location.search).get("workspace"),
        );
        const target = data.workspaces.some(
          (w: { id: number }) => w.id === requested,
        )
          ? requested
          : 0;
        setWorkspaceId(target);
        if (initialFormId) {
          const result = await api(`/api/forms/${initialFormId}`);
          if (active) setEditor(result.form);
        } else if (createNew) {
          setEditor({
            automation: { ...defaultAutomation },
            workspaceId: target || null,
            projectId: null,
            title: "Form tanpa judul",
            description: "",
            fields: [field()],
            isPublished: false,
          });
          setDirty(true);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [initialFormId, createNew]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(patch: Partial<Editor>) {
    setEditor((e) => {
      if (!e) return e;
      const next = { ...e, ...patch };
      if (patch.fields && !patch.sections && e.sections)
        next.sections = e.sections.map((s) => ({
          ...s,
          fieldIds: s.fieldIds.filter((id) =>
            patch.fields!.some((f) => f.id === id),
          ),
          branch:
            s.branch &&
            patch.fields!.some(
              (f) =>
                f.id === s.branch?.fieldId &&
                ["select", "radio"].includes(f.type),
            )
              ? {
                  ...s.branch,
                  routes: s.branch.routes.filter((r) =>
                    patch
                      .fields!.find((f) => f.id === s.branch?.fieldId)!
                      .options.map((o) => o.trim())
                      .concat(
                        patch.fields!.find((f) => f.id === s.branch?.fieldId)
                          ?.allowOther
                          ? [OTHER_OPTION]
                          : [],
                      )
                      .includes(r.answer),
                  ),
                }
              : null,
        }));
      return next;
    });
    setDirty(true);
    setMessage("");
  }
  function updateField(index: number, patch: Partial<FormField>) {
    if (editor)
      update({
        fields: editor.fields.map((f, i) =>
          i === index ? { ...f, ...patch } : f,
        ),
      });
  }
  function reorder(index: number, direction: number) {
    if (!editor) return;
    const fields = [...editor.fields];
    const section = (editor.sections ?? defaultSections(fields)).find((s) =>
      s.fieldIds.includes(fields[index].id),
    )!;
    const indexes = fields
      .map((f, i) => (section.fieldIds.includes(f.id) ? i : -1))
      .filter((i) => i >= 0);
    const other = indexes[indexes.indexOf(index) + direction];
    if (other === undefined) return;
    [fields[index], fields[other]] = [fields[other], fields[index]];
    update({ fields });
  }
  async function save() {
    if (!editor || headerUploading) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const definition = validateDefinition(editor);
      const automation = validateAutomation(
        editor.automation,
        definition.fields,
        editor.projectId,
      );
      const result = await api(
        editor.id ? `/api/forms/${editor.id}` : "/api/forms",
        {
          method: editor.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...definition,
            workspaceId: editor.workspaceId,
            projectId: editor.projectId,
            automation,
          }),
        },
      );
      setEditor({
        ...editor,
        ...definition,
        id: editor.id ?? result.id,
        token: editor.token ?? result.token,
      });
      setDirty(false);
      setMessage("Form tersimpan.");
      await reload();
      if (!editor.id) router.replace(`/team/forms/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadResponses(nextPage = 1) {
    if (!editor?.id) return;
    setBusy(true);
    setError("");
    try {
      const data = await api(
        `/api/forms/${editor.id}/responses?page=${nextPage}`,
      );
      setResponses(data.responses);
      setHasMore(data.hasMore);
      setTotalResponses(data.totalResponses ?? data.responses.length);
      setSummary(data.summary ?? []);
      setPage(nextPage);
      setTab("responses");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pages = editor
    ? (editor.sections ?? defaultSections(editor.fields))
    : [];
  function updateSection(section: FormSection) {
    update({ sections: pages.map((s) => (s.id === section.id ? section : s)) });
  }
  function addQuestion(sectionId: string) {
    if (!editor) return;
    const question = field();
    update({
      fields: [...editor.fields, question],
      sections: pages.map((s) =>
        s.id === sectionId
          ? { ...s, fieldIds: [...s.fieldIds, question.id] }
          : s,
      ),
    });
  }
  function removeSection(section: FormSection, index: number) {
    if (!editor || pages.length < 2) return;
    const mergeInto = pages[index === 0 ? 1 : index - 1].id;
    update({
      sections: pages
        .filter((s) => s.id !== section.id)
        .map((s) => ({
          ...s,
          fieldIds:
            s.id === mergeInto
              ? [...s.fieldIds, ...section.fieldIds]
              : s.fieldIds,
          next: s.next === section.id ? "next" : s.next,
          branch: s.branch
            ? {
                ...s.branch,
                routes: s.branch.routes.map((r) => ({
                  ...r,
                  target: r.target === section.id ? "next" : r.target,
                })),
              }
            : null,
        })),
    });
  }
  const shown = forms.filter(
    (f) => !workspaceId || f.workspaceId === workspaceId,
  );
  return (
    <div className="h-full overflow-auto bg-[#191919] text-white/90">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-10">
        {editor ? (
          <>
            <button
              className="mb-6 flex items-center gap-2 text-sm text-white/50 hover:text-white"
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm("Tinggalkan perubahan yang belum disimpan?")
                )
                  return;
                setDirty(false);
                router.push("/team/forms");
              }}
            >
              <ArrowLeft size={16} />
              Semua form
            </button>
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-xs uppercase tracking-widest text-white">
                  Clickme Forms
                </p>
                <h1 className="text-2xl font-semibold">
                  {editor.id ? editor.title : "Buat form baru"}
                </h1>
                <p className="mt-2 text-sm text-white/40">
                  {workspaces.find((w) => w.id === editor.workspaceId)?.name ||
                    "Form mandiri"}
                  {editor.projectId
                    ? ` / ${projects.find((p) => p.id === editor.projectId)?.name || "Project"}`
                    : ""}{" "}
                  {dirty && "· Perubahan belum disimpan"}
                </p>
              </div>
              <button
                className={`${primary} form-save-button`}
                disabled={busy || headerUploading}
                onClick={save}
              >
                <Check size={16} />
                {busy ? "Memproses…" : "Simpan form"}
              </button>
            </header>
            {editor.token && (
              <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <span
                  className={`rounded-md px-2 py-1 text-xs ${editor.isPublished && !dirty ? "bg-emerald-400/10 text-emerald-400" : "bg-white/10 text-white/50"}`}
                >
                  {dirty
                    ? "Belum disimpan"
                    : editor.isPublished
                      ? "Dipublikasikan"
                      : "Draft · Form ditutup"}
                </span>
                <code className="min-w-0 flex-1 truncate text-xs text-white/50">
                  /f/{editor.token}
                </code>
                <button
                  className={button}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${location.origin}/f/${editor.token}`,
                      );
                      setMessage(
                        "Tautan disalin. Form harus dipublikasikan agar dapat diisi.",
                      );
                    } catch {
                      setError(
                        "Tautan gagal disalin. Salin alamat dari halaman form.",
                      );
                    }
                  }}
                >
                  <Copy size={14} />
                  Salin tautan
                </button>
                <a
                  className={button}
                  href={`/f/${editor.token}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} />
                  Buka
                </a>
              </div>
            )}
            <nav className="my-6 flex gap-5 overflow-x-auto border-b border-white/10">
              {(
                [
                  ["edit", "Pertanyaan"],
                  ["preview", "Pratinjau"],
                  ["responses", "Jawaban"],
                  ["settings", "Settings"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  disabled={
                    busy ||
                    headerUploading ||
                    (value === "responses" && !editor.id)
                  }
                  className={`border-b-2 pb-3 text-sm disabled:opacity-30 ${tab === value ? "border-white text-white" : "border-transparent text-white/40"}`}
                  onClick={() =>
                    value === "responses" ? loadResponses() : setTab(value)
                  }
                >
                  {label}
                </button>
              ))}
            </nav>
          </>
        ) : (
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-3 flex items-center gap-2 text-white">
                <FileText size={22} />
                <span className="text-xs uppercase tracking-widest">
                  Workspace tools
                </span>
              </div>
              <h1 className="text-3xl font-semibold">Forms</h1>
              <p className="mt-2 text-sm text-white/45">
                Buat form, bagikan tautan, dan kumpulkan jawaban di satu tempat.
              </p>
            </div>
            <Link
              className={primary}
              href={
                workspaceId
                  ? `/team/forms/new?workspace=${workspaceId}`
                  : "/team/forms/new"
              }
            >
              <Plus size={17} />
              Buat form
            </Link>
          </header>
        )}
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="mb-5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-300"
          >
            {message}
          </p>
        )}
        {!editor ? (
          <>
            <select
              aria-label="Filter workspace"
              className={`${input} mb-6 sm:max-w-xs`}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(Number(e.target.value))}
            >
              <option className="bg-zinc-900" value={0}>
                Semua workspace
              </option>
              {workspaces.map((w) => (
                <option className="bg-zinc-900" key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {loading ? (
              <p className="py-12 text-center text-white/40">Memuat form…</p>
            ) : !shown.length ? (
              <div className="rounded-2xl border border-dashed border-white/15 px-5 py-16 text-center">
                <FileText size={36} className="mx-auto mb-4 text-white" />
                <h2 className="font-medium">Form pertamamu dimulai di sini</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/40">
                  Buat banyak form sesuai kebutuhan. Hubungkan ke workspace atau
                  project kapan saja.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {shown.map((f) => (
                  <Link
                    key={f.id}
                    href={`/team/forms/${f.id}`}
                    className="rounded-xl border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-white/50 hover:bg-white/5"
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <FileText className="text-white" size={22} />
                      <span
                        className={`rounded-md px-2 py-1 text-xs ${f.isPublished ? "bg-emerald-400/10 text-emerald-400" : "bg-white/5 text-white/40"}`}
                      >
                        {f.isPublished ? "Dipublikasikan" : "Draft"}
                      </span>
                    </div>
                    <h2 className="truncate font-semibold">{f.title}</h2>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm text-white/40">
                      {f.description || "Tanpa deskripsi"}
                    </p>
                    <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-white/45">
                      <span>
                        {projects.find((p) => p.id === f.projectId)?.name ||
                          workspaces.find((w) => w.id === f.workspaceId)
                            ?.name ||
                          "Form mandiri"}
                      </span>
                      <span>{f.responseCount} jawaban</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : tab === "edit" ? (
          <fieldset disabled={busy || headerUploading} className="space-y-4">
            <FormHeaderEditor
              title={editor.title}
              description={editor.description}
              presentation={editor.presentation}
              disabled={busy}
              onChange={update}
              onUploading={setHeaderUploading}
            />

            {pages.map((section, sectionIndex) => (
              <section key={section.id} className="space-y-4">
                {sectionIndex > 0 && (
                  <FormSectionSettings
                    section={section}
                    index={sectionIndex}
                    sections={pages}
                    fields={editor.fields}
                    onChange={updateSection}
                    onRemove={() => removeSection(section, sectionIndex)}
                  />
                )}
                {editor.fields.map((f, index) =>
                  section.fieldIds.includes(f.id) ? (
                    <div
                      key={f.id}
                      className="rounded-xl border border-white/10 p-5"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-xs font-medium text-white">
                          PERTANYAAN {index + 1}
                        </span>
                        <div className="flex gap-1">
                          <button
                            aria-label="Naikkan pertanyaan"
                            className="rounded p-2 hover:bg-white/10 disabled:opacity-20"
                            disabled={
                              editor.fields.find((f) =>
                                section.fieldIds.includes(f.id),
                              )?.id === f.id
                            }
                            onClick={() => reorder(index, -1)}
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            aria-label="Turunkan pertanyaan"
                            className="rounded p-2 hover:bg-white/10 disabled:opacity-20"
                            disabled={
                              editor.fields
                                .filter((f) => section.fieldIds.includes(f.id))
                                .at(-1)?.id === f.id
                            }
                            onClick={() => reorder(index, 1)}
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            aria-label="Hapus pertanyaan"
                            className="rounded p-2 text-white/40 hover:bg-red-400/10 hover:text-red-400 disabled:opacity-20"
                            disabled={editor.fields.length === 1}
                            onClick={() =>
                              update({
                                fields: editor.fields.filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                          aria-label={`Label pertanyaan ${index + 1}`}
                          placeholder="Tulis pertanyaan…"
                          className={`${input} flex-1`}
                          maxLength={500}
                          value={f.label}
                          onChange={(e) =>
                            updateField(index, { label: e.target.value })
                          }
                        />
                        <FormFieldTypePicker
                          label={`Jenis pertanyaan ${index + 1}`}
                          value={f.type}
                          onChange={(type) => updateField(index, { type })}
                        />
                      </div>
                      <FormQuestionFooter
                        field={f}
                        onChange={(patch) => updateField(index, patch)}
                      >
                        {(f.type === "select" ||
                          f.type === "radio" ||
                          f.type === "checkbox") && (
                          <FormChoiceEditor
                            field={f}
                            disabled={busy}
                            onChange={(patch) => updateField(index, patch)}
                            onUploading={setHeaderUploading}
                          />
                        )}
                      </FormQuestionFooter>
                    </div>
                  ) : null,
                )}
                <button
                  className={`${button} w-full border-dashed py-4 text-white`}
                  disabled={editor.fields.length >= 50}
                  onClick={() => addQuestion(section.id)}
                >
                  <Plus size={17} />
                  Tambah pertanyaan
                </button>
              </section>
            ))}
            <button
              type="button"
              disabled={pages.length >= 20}
              className={`${button} w-full border-white/30 py-4 text-white`}
              onClick={() =>
                update({
                  sections: [
                    ...pages,
                    {
                      id: createClientId(),
                      title: `Halaman ${pages.length + 1}`,
                      description: "",
                      fieldIds: [],
                      next: "next",
                      branch: null,
                    },
                  ],
                })
              }
            >
              <Plus size={17} />
              Tambah pemisah halaman
            </button>
          </fieldset>
        ) : tab === "settings" ? (
          <fieldset disabled={busy || headerUploading} className="space-y-4">
            {pages.length > 1 && (
              <FormSectionSettings
                section={pages[0]}
                index={0}
                sections={pages}
                fields={editor.fields}
                onChange={updateSection}
                onRemove={() => removeSection(pages[0], 0)}
              />
            )}
            <div className="space-y-4 rounded-xl border border-white/10 p-5">
              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <h2 className="mb-1 text-sm font-medium">Hubungkan form</h2>
                <p className="mb-4 text-xs leading-5 text-white/40">
                  Pilih workspace lalu project tujuan. Jawaban yang masuk akan
                  membuat task otomatis jika project dipilih.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-white/60">
                    Workspace
                    <select
                      className={`${input} mt-2`}
                      value={editor.workspaceId || 0}
                      onChange={(e) =>
                        update({
                          workspaceId: Number(e.target.value) || null,
                          projectId: null,
                          automation: {
                            ...editor.automation,
                            whatsappEnabled: false,
                          },
                        })
                      }
                    >
                      <option className="bg-zinc-900" value={0}>
                        Tidak terhubung · Form mandiri
                      </option>
                      {workspaces.map((w) => (
                        <option className="bg-zinc-900" key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-white/60">
                    Project{" "}
                    <span className="text-xs text-white/30">(opsional)</span>
                    <select
                      className={`${input} mt-2 disabled:opacity-40`}
                      disabled={!editor.workspaceId}
                      value={editor.projectId || 0}
                      onChange={(e) =>
                        update({
                          projectId: Number(e.target.value) || null,
                          automation: {
                            ...editor.automation,
                            whatsappEnabled: false,
                          },
                        })
                      }
                    >
                      <option className="bg-zinc-900" value={0}>
                        Workspace saja
                      </option>
                      {projects
                        .filter((p) => p.workspaceId === editor.workspaceId)
                        .map((p) => (
                          <option
                            className="bg-zinc-900"
                            key={p.id}
                            value={p.id}
                          >
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-white"
                  checked={editor.isPublished}
                  onChange={(e) => update({ isPublished: e.target.checked })}
                />
                <span>
                  Publikasikan form{" "}
                  <span className="block text-xs text-white/40">
                    Siapa pun dengan tautan dapat mengisi tanpa login. Simpan
                    untuk menerapkan.
                  </span>
                </span>
              </label>
            </div>
            <FormAutomationSettings
              value={editor.automation}
              fields={editor.fields}
              projectId={editor.projectId}
              projectName={
                projects.find((p) => p.id === editor.projectId)?.name ||
                "Project"
              }
              onChange={(automation) => update({ automation })}
            />
          </fieldset>
        ) : tab === "preview" ? (
          <div className="mx-auto max-w-2xl rounded-xl border border-white/10 p-6">
            <p className="mb-6 text-xs text-white">
              PRATINJAU · Jawaban di sini tidak disimpan
            </p>
            <FormFlow form={editor} preview />
          </div>
        ) : (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {totalResponses > 0
                    ? `${totalResponses} Tanggapan`
                    : "Tanggapan"}
                </h2>
                <p className="text-xs text-white/40">
                  {totalResponses > 0
                    ? `Total ${totalResponses} jawaban telah dikumpulkan`
                    : "Belum ada jawaban yang masuk"}
                </p>
              </div>
              <button
                className={`flex items-center gap-2 ${button}`}
                disabled={busy}
                onClick={() => loadResponses(page)}
              >
                <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
                Muat ulang
              </button>
            </div>

            <div className="mb-6 flex gap-2 border-b border-white/10 pb-3">
              <button
                type="button"
                onClick={() => setResponseSubTab("summary")}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                  responseSubTab === "summary"
                    ? "bg-white/15 text-white shadow-xs"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <BarChart3 size={14} />
                Ringkasan {totalResponses > 0 ? `(${totalResponses})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setResponseSubTab("individual")}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                  responseSubTab === "individual"
                    ? "bg-white/15 text-white shadow-xs"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <ListOrdered size={14} />
                Individu {totalResponses > 0 ? `(${totalResponses})` : ""}
              </button>
            </div>

            {responseSubTab === "summary" ? (
              <div>
                {totalResponses === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 py-14 text-center text-sm text-white/40">
                    Belum ada jawaban. Publikasikan form dan bagikan tautannya.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {summary.map((item, index) => {
                      const isChoice =
                        item.type === "radio" ||
                        item.type === "select" ||
                        item.type === "checkbox";
                      return (
                        <section
                          key={item.fieldId}
                          className="rounded-xl border border-white/10 bg-white/[0.02] p-5 shadow-xs transition hover:border-white/20"
                        >
                          <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-white/5 pb-3">
                            <div className="min-w-0 flex-1">
                              <h3 className="break-words text-sm font-medium text-white">
                                <span className="mr-2 font-mono text-xs text-white/40">
                                  {index + 1}.
                                </span>
                                {item.label || "Pertanyaan tanpa judul"}
                              </h3>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
                                {FIELD_TYPE_LABELS[item.type] || item.type}
                              </span>
                              <span className="rounded-md bg-current/15 px-2 py-0.5 text-[11px] font-medium text-current">
                                {item.totalAnswered} tanggapan
                              </span>
                            </div>
                          </div>

                          {isChoice ? (
                            <div className="space-y-3">
                              {item.options && item.options.length > 0 ? (
                                item.options.map((opt, optIndex) => {
                                  const barColor =
                                    OPTION_BAR_COLORS[
                                      optIndex % OPTION_BAR_COLORS.length
                                    ];
                                  return (
                                    <div key={opt.label} className="space-y-1">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="break-words font-medium text-white/80">
                                          {opt.label}
                                        </span>
                                        <span className="ml-2 shrink-0 font-mono text-white/60">
                                          {opt.count}{" "}
                                          <span className="opacity-50">
                                            ({opt.percentage}%)
                                          </span>
                                        </span>
                                      </div>
                                      <div className="h-6 w-full overflow-hidden rounded-md border border-white/5 bg-white/5 p-0.5">
                                        <div
                                          className={`h-full rounded-[4px] ${barColor} transition-all duration-500`}
                                          style={{
                                            width: `${Math.max(
                                              opt.percentage,
                                              opt.count > 0 ? 3 : 0,
                                            )}%`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-xs italic text-white/40">
                                  Tidak ada opsi pilihan yang dikonfigurasi.
                                </p>
                              )}

                              {item.otherCount && item.otherCount > 0 ? (
                                <div className="mt-4 border-t border-white/5 pt-3">
                                  <div className="mb-2 flex items-center justify-between text-xs">
                                    <span className="font-medium text-amber-400">
                                      Jawaban lainnya ({item.otherCount}{" "}
                                      tanggapan)
                                    </span>
                                  </div>
                                  {item.otherAnswers &&
                                    item.otherAnswers.length > 0 && (
                                      <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                                        {item.otherAnswers.map(
                                          (otherText, oi) => (
                                            <div
                                              key={oi}
                                              className="rounded-md border border-white/5 bg-white/[0.03] px-3 py-1.5 text-xs break-words text-white/80"
                                            >
                                              {otherText}
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    )}
                                </div>
                              ) : null}
                            </div>
                          ) : item.type === "number" ? (
                            <div>
                              {item.numberStats ? (
                                <div>
                                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                                      <p className="text-[11px] uppercase tracking-wider text-white/50">
                                        Rata-rata
                                      </p>
                                      <p className="mt-0.5 text-lg font-semibold text-white">
                                        {item.numberStats.avg}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                                      <p className="text-[11px] uppercase tracking-wider text-white/50">
                                        Terendah (Min)
                                      </p>
                                      <p className="mt-0.5 text-lg font-semibold text-emerald-400">
                                        {item.numberStats.min}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                                      <p className="text-[11px] uppercase tracking-wider text-white/50">
                                        Tertinggi (Max)
                                      </p>
                                      <p className="mt-0.5 text-lg font-semibold text-rose-400">
                                        {item.numberStats.max}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                                      <p className="text-[11px] uppercase tracking-wider text-white/50">
                                        Total Nilai
                                      </p>
                                      <p className="mt-0.5 text-lg font-semibold text-current">
                                        {item.numberStats.sum}
                                      </p>
                                    </div>
                                  </div>

                                  {item.numberStats.recentValues.length > 0 && (
                                    <div>
                                      <p className="mb-2 text-xs text-white/40">
                                        Nilai terbaru yang masuk:
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {item.numberStats.recentValues.map(
                                          (v, vi) => (
                                            <span
                                              key={vi}
                                              className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-white/80"
                                            >
                                              {v}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs italic text-white/40">
                                  Belum ada jawaban angka untuk pertanyaan ini.
                                </p>
                              )}
                            </div>
                          ) : (
                            <div>
                              {item.textAnswers &&
                              item.textAnswers.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="mb-1 flex items-center justify-between text-xs text-white/40">
                                    <span>Jawaban yang masuk:</span>
                                    <span>
                                      {item.textAnswers.length} jawaban unik
                                    </span>
                                  </div>
                                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                                    {item.textAnswers.map((ans, ai) => (
                                      <div
                                        key={ai}
                                        className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3.5 py-2 text-xs transition hover:bg-white/[0.05]"
                                      >
                                        <span className="flex-1 whitespace-pre-wrap break-words leading-relaxed text-white/90">
                                          {ans.value}
                                        </span>
                                        {ans.count > 1 && (
                                          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/70">
                                            {ans.count}x
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs italic text-white/40">
                                  Belum ada jawaban teks untuk pertanyaan ini.
                                </p>
                              )}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-white/40">
                    Jawaban terbaru · Halaman {page}
                  </p>
                </div>
                {!responses.length ? (
                  <div className="rounded-xl border border-dashed border-white/15 py-14 text-center text-sm text-white/40">
                    Belum ada jawaban. Publikasikan form dan bagikan tautannya.
                  </div>
                ) : (
                  responses.map((r) => (
                    <article
                      className="mb-4 rounded-xl border border-white/10 p-5"
                      key={r.id}
                    >
                      <div className="mb-4 flex justify-between text-xs text-white/40">
                        <span>Jawaban #{r.id}</span>
                        <time>
                          {new Date(r.createdAt).toLocaleString("id-ID")}
                        </time>
                      </div>
                      {r.taskId && (
                        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
                          <Link
                            className="text-white hover:underline"
                            href={`/team/projects/${r.projectSlug}/v/l`}
                          >
                            Task #{r.taskId} · Buka project
                          </Link>
                          {r.notificationAttempts !== null && (
                            <span
                              className={
                                r.notificationSentAt
                                  ? "text-emerald-400"
                                  : "text-amber-300"
                              }
                            >
                              {r.notificationSentAt
                                ? "WhatsApp terkirim"
                                : r.notificationAttempts > 0
                                  ? "WhatsApp menunggu percobaan ulang"
                                  : "WhatsApp dalam antrean"}
                            </span>
                          )}
                        </div>
                      )}
                      <dl className="space-y-4">
                        {r.fields.map((f) => (
                          <div key={f.id}>
                            <dt className="text-xs text-white/40">{f.label}</dt>
                            <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                              {(Array.isArray(r.answers[f.id])
                                ? (r.answers[f.id] as string[]).join(", ")
                                : r.answers[f.id]) || "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    className={button}
                    disabled={page === 1 || busy}
                    onClick={() => loadResponses(page - 1)}
                  >
                    Sebelumnya
                  </button>
                  <button
                    className={button}
                    disabled={!hasMore || busy}
                    onClick={() => loadResponses(page + 1)}
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
