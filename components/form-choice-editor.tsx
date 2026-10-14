"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { OTHER_OPTION } from "@/lib/form-choice-values";
import type { FormField } from "@/lib/native-form-fields";

const input =
  "min-w-0 flex-1 rounded-none border-0 border-b border-white/15 bg-transparent px-0 py-2 text-sm outline-none transition-colors hover:border-white/30 focus:border-white";

function imageFor(field: FormField, option: string) {
  return field.optionImages?.find((item) => item.value === option)?.imageId;
}

function remapImages(
  field: FormField,
  from: string,
  to: string,
): FormField["optionImages"] {
  const images = field.optionImages ?? [];
  if (!from && !to) return images;
  return images
    .map((item) => (item.value === from ? { ...item, value: to } : item))
    .filter((item) => item.value.trim() && item.value !== OTHER_OPTION);
}

export default function FormChoiceEditor({
  field,
  disabled,
  onChange,
  onUploading,
}: {
  field: FormField;
  disabled: boolean;
  onChange: (patch: Partial<FormField>) => void;
  onUploading: (busy: boolean) => void;
}) {
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const [error, setError] = useState("");
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const options = field.options.length ? field.options : [""];
  const multiple = field.type === "checkbox";

  function setOptions(
    next: string[],
    optionImages = field.optionImages,
    allowOther = field.allowOther,
  ) {
    onChange({
      options: next,
      optionImages: optionImages?.length ? optionImages : undefined,
      allowOther: allowOther || undefined,
    });
  }

  async function uploadOptionImage(index: number, file: File) {
    const option = options[index]?.trim();
    if (uploadingIndex !== null || imageFor(field, option ?? "")) return;
    if (!option) {
      setError("Isi teks opsi dulu sebelum menambah gambar.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 5 MB.");
      return;
    }
    setError("");
    setUploadingIndex(index);
    onUploading(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch("/api/form-images", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id)
        throw new Error(data.error || "Gagal unggah gambar.");
      const rest = (field.optionImages ?? []).filter(
        (item) => item.value !== option,
      );
      setOptions(options, [...rest, { value: option, imageId: data.id }]);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setUploadingIndex(null);
      onUploading(false);
    }
  }

  const locked = disabled || uploadingIndex !== null;
  const marker = `size-4 shrink-0 border-2 border-white/30 ${multiple ? "rounded-sm" : "rounded-full"}`;

  return (
    <div className="mt-5 space-y-4">
      {options.map((option, index) => {
        const imageId = imageFor(field, option.trim());
        return (
          <div key={index} className="space-y-3">
            <div className="flex items-center gap-3">
              <span aria-hidden className={marker} />
              <input
                aria-label={`Opsi ${index + 1}`}
                placeholder={`Opsi ${index + 1}`}
                className={input}
                maxLength={200}
                disabled={locked}
                value={option}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.trim() === OTHER_OPTION) {
                    setError("Teks opsi ini tidak dapat digunakan.");
                    return;
                  }
                  const next = options.map((item, itemIndex) =>
                    itemIndex === index ? value : item,
                  );
                  setOptions(
                    next,
                    remapImages(field, option.trim(), value.trim()),
                  );
                }}
              />
              <input
                ref={(node) => {
                  fileInputs.current[index] = node;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                aria-label={`Unggah gambar opsi ${index + 1}`}
                disabled={locked}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void uploadOptionImage(index, file);
                }}
              />
              {!imageId && (
                <button
                  type="button"
                  title="Tambah gambar opsi"
                  aria-label={`Tambah gambar opsi ${index + 1}`}
                  disabled={locked}
                  onClick={() => fileInputs.current[index]?.click()}
                  className="shrink-0 rounded-md p-2 text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
                >
                  <ImagePlus size={18} />
                </button>
              )}
              <button
                type="button"
                title="Hapus opsi"
                aria-label={`Hapus opsi ${index + 1}`}
                disabled={locked || options.length <= 1}
                onClick={() =>
                  setOptions(
                    options.filter((_, itemIndex) => itemIndex !== index),
                    (field.optionImages ?? []).filter(
                      (item) => item.value !== option.trim(),
                    ),
                  )
                }
                className="shrink-0 rounded-md p-2 text-white/35 transition hover:bg-white/5 hover:text-red-300 disabled:opacity-20"
              >
                <X size={18} />
              </button>
            </div>
            {imageId && (
              <div className="ml-7 pb-3 pt-1">
                <div className="relative inline-block max-w-full align-top">
                  {/* The uploaded image keeps its natural proportions in the editor. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/form-images/${imageId}`}
                    alt={option || `Gambar opsi ${index + 1}`}
                    className="block h-auto max-h-48 w-auto max-w-full rounded-sm border border-white/10 shadow-sm"
                  />
                  <button
                    type="button"
                    title="Hapus gambar"
                    aria-label={`Hapus gambar opsi ${index + 1}`}
                    disabled={locked}
                    onClick={() =>
                      setOptions(
                        options,
                        (field.optionImages ?? []).filter(
                          (item) => item.value !== option.trim(),
                        ),
                      )
                    }
                    className="absolute -right-3 -top-3 flex size-8 items-center justify-center rounded-full border border-white/15 bg-[#333333] text-white/70 shadow-md transition hover:bg-[#444444] hover:text-white disabled:opacity-30"
                  >
                    <X size={19} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {field.allowOther && (
        <div className="flex items-center gap-3 text-sm text-white/50">
          <span aria-hidden className={marker} />
          <span className="flex-1 border-b border-dashed border-white/20 py-2">
            Lainnya…
          </span>
          <button
            type="button"
            title="Hapus Lainnya"
            aria-label="Hapus opsi Lainnya"
            disabled={locked}
            onClick={() => setOptions(options, field.optionImages, false)}
            className="rounded-md p-2 text-white/35 hover:text-red-300 disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>
      )}
      <div className="flex items-start gap-3 pt-1">
        <span aria-hidden className={`${marker} mt-2.5 opacity-60`} />
        <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
          <button
            type="button"
            disabled={locked || options.length >= 100}
            onClick={() => setOptions([...options, ""])}
            className="py-2 text-white/45 hover:text-white/75 disabled:opacity-30"
          >
            Tambahkan opsi
          </button>
          {!field.allowOther && (
            <>
              <span className="text-white/65">atau</span>
              <button
                type="button"
                disabled={locked}
                onClick={() => setOptions(options, field.optionImages, true)}
                className="py-2 font-medium text-white hover:text-white disabled:opacity-30"
              >
                tambahkan &quot;Lainnya&quot;
              </button>
            </>
          )}
        </div>
      </div>
      {uploadingIndex !== null && (
        <p role="status" className="ml-7 text-xs text-white/40">
          Mengunggah gambar opsi…
        </p>
      )}
      {error && (
        <p role="alert" className="ml-7 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
