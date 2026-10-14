"use client";
import { useState } from "react";
import type { FormField } from "@/lib/native-form-fields";
import {
  defaultAutomation,
  renderFormTemplate,
  type FormAutomation,
} from "@/lib/native-form-automation";
import { WhatsAppGroupConnection } from "@/components/whatsapp-group-connection";
const input =
  "mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white";
export default function FormAutomationSettings({
  value,
  fields,
  projectId,
  projectName,
  onChange,
}: {
  value: FormAutomation;
  fields: FormField[];
  projectId: number | null;
  projectName: string;
  onChange: (value: FormAutomation) => void;
}) {
  const [target, setTarget] = useState<"taskTitle" | "whatsappTemplate">(
    "taskTitle",
  );
  function update(patch: Partial<FormAutomation>) {
    onChange({ ...value, ...patch });
  }
  const variables = [
    { key: "form", label: "Nama form" },
    { key: "response_id", label: "Nomor jawaban" },
    { key: "project", label: "Project" },
    { key: "workspace", label: "Workspace" },
    { key: "task", label: "Judul task" },
    { key: "answers", label: "Semua jawaban" },
    { key: "task_url", label: "Tautan project" },
    ...fields
      .filter((f) => f.label.trim())
      .map((f) => ({ key: `field:${f.id}`, label: f.label })),
  ];
  const samples = Object.fromEntries(
    variables.map((v) => [v.key, `[${v.label}]`]),
  );
  return (
    <div className="space-y-5 rounded-xl border border-white/20 bg-white/[0.03] p-5">
      <div>
        <h2 className="font-semibold">Task & WhatsApp</h2>
        <p className="mt-2 text-xs leading-5 text-white/45">
          {projectId
            ? `Setiap jawaban baru otomatis menjadi task di ${projectName}. Jawaban juga tetap tersedia di tab Jawaban.`
            : "Pilih project di atas untuk membuat task otomatis dari setiap jawaban."}
        </p>
      </div>
      {projectId && (
        <>
          <label className="block text-sm text-white/60">
            Judul task
            <input
              className={input}
              value={value.taskTitle}
              maxLength={500}
              onFocus={() => setTarget("taskTitle")}
              onChange={(e) => update({ taskTitle: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-white"
              checked={value.whatsappEnabled}
              onChange={(e) => update({ whatsappEnabled: e.target.checked })}
            />
            Kirim notifikasi WhatsApp saat jawaban masuk
          </label>
          {value.whatsappEnabled && (
            <>
              <label className="block text-sm text-white/60">
                Tujuan pesan
                <select
                  className={input}
                  value={value.whatsappMode}
                  onChange={(e) =>
                    update({
                      whatsappMode: e.target
                        .value as FormAutomation["whatsappMode"],
                    })
                  }
                >
                  <option className="bg-zinc-900" value="groups">
                    Grup yang terhubung ke project dan workspace
                  </option>
                  <option className="bg-zinc-900" value="direct">
                    Nomor WhatsApp tertentu
                  </option>
                </select>
              </label>
              {value.whatsappMode === "direct" ? (
                <label className="block text-sm text-white/60">
                  Nomor WhatsApp
                  <input
                    type="tel"
                    className={input}
                    placeholder="628123456789"
                    value={value.whatsappRecipient}
                    onChange={(e) =>
                      update({ whatsappRecipient: e.target.value })
                    }
                  />
                  <span className="mt-2 block text-xs text-white/40">
                    Gunakan kode negara, misalnya 62 untuk Indonesia.
                  </span>
                </label>
              ) : (
                <WhatsAppGroupConnection
                  key={projectId}
                  scopeType="project"
                  scopeId={projectId}
                  scopeName={projectName}
                />
              )}
              <label className="block text-sm text-white/60">
                Template pesan
                <textarea
                  rows={6}
                  className={input}
                  maxLength={10000}
                  value={value.whatsappTemplate}
                  onFocus={() => setTarget("whatsappTemplate")}
                  onChange={(e) => update({ whatsappTemplate: e.target.value })}
                />
              </label>
            </>
          )}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-white/45">
                Klik variabel untuk menambahkan ke:
              </p>
              <select
                aria-label="Tujuan variabel"
                className="rounded-md border border-white/15 bg-transparent px-2 py-1 text-xs"
                value={target}
                onChange={(e) => setTarget(e.target.value as typeof target)}
              >
                <option className="bg-zinc-900" value="taskTitle">
                  Judul task
                </option>
                <option className="bg-zinc-900" value="whatsappTemplate">
                  Pesan WhatsApp
                </option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {variables.map((v) => (
                <button
                  type="button"
                  key={v.key}
                  className="max-w-full truncate rounded-md border border-white/20 px-2 py-1 text-xs text-white hover:bg-white/10"
                  onClick={() =>
                    update({ [target]: `${value[target]} {{${v.key}}}` })
                  }
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          {value.whatsappEnabled && (
            <div className="rounded-lg bg-black/20 p-4">
              <p className="mb-2 text-xs text-white/35">
                Pratinjau pesan · Nilai contoh
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-white/75">
                {renderFormTemplate(
                  value.whatsappTemplate || defaultAutomation.whatsappTemplate,
                  samples,
                )}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
