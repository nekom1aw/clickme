"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import FormRichText from "@/components/form-rich-text";
import { FormHeaderImage } from "@/components/form-header";
import {
  emptyPresentation,
  type FormPresentation,
} from "@/lib/form-presentation";
export default function FormHeaderEditor({
  title,
  description,
  presentation,
  disabled,
  onChange,
  onUploading,
}: {
  title: string;
  description: string;
  presentation?: FormPresentation;
  disabled: boolean;
  onChange: (patch: {
    title?: string;
    description?: string;
    presentation: FormPresentation;
  }) => void;
  onUploading: (busy: boolean) => void;
}) {
  const value = presentation ?? emptyPresentation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="h-2 bg-white" />
      <div className="space-y-7 p-5 sm:p-6">
        <div>
          {value.imageId && <FormHeaderImage presentation={value} />}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            aria-label="Unggah gambar header"
            disabled={disabled || uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                setError("Ukuran gambar maksimal 5 MB.");
                return;
              }
              setError("");
              setUploading(true);
              onUploading(true);
              try {
                const body = new FormData();
                body.append("image", file);
                const response = await fetch("/api/form-images", {
                  method: "POST",
                  body,
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                onChange({
                  presentation: {
                    ...latest.current,
                    imageId: data.id,
                    imageX: 50,
                    imageY: 50,
                  },
                });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setUploading(false);
                onUploading(false);
              }
            }}
          />
          <div
            className={`${value.imageId ? "mt-3" : "rounded-lg border border-dashed border-white/15 p-5"} flex flex-wrap items-center gap-3`}
          >
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/5 disabled:opacity-40"
            >
              <ImagePlus size={16} />
              {uploading
                ? "Mengunggah…"
                : value.imageId
                  ? "Ganti gambar"
                  : "Tambah gambar header"}
            </button>
            <p className="text-xs text-white/35">
              16:9 · JPG, PNG, WebP · Maks. 5 MB
            </p>
            {value.imageId && (
              <button
                type="button"
                disabled={disabled || uploading}
                title="Hapus gambar header"
                aria-label="Hapus gambar header"
                onClick={() =>
                  onChange({ presentation: { ...value, imageId: null } })
                }
                className="ml-auto rounded-md p-2 text-white/40 hover:text-red-300"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          {value.imageId && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-white/40">
                Posisi horizontal
                <input
                  aria-label="Posisi gambar horizontal"
                  type="range"
                  min={0}
                  max={100}
                  value={value.imageX}
                  disabled={disabled || uploading}
                  onChange={(e) =>
                    onChange({
                      presentation: {
                        ...value,
                        imageX: Number(e.target.value),
                      },
                    })
                  }
                  className="mt-2 block w-full accent-white"
                />
              </label>
              <label className="text-xs text-white/40">
                Posisi vertikal
                <input
                  aria-label="Posisi gambar vertikal"
                  type="range"
                  min={0}
                  max={100}
                  value={value.imageY}
                  disabled={disabled || uploading}
                  onChange={(e) =>
                    onChange({
                      presentation: {
                        ...value,
                        imageY: Number(e.target.value),
                      },
                    })
                  }
                  className="mt-2 block w-full accent-white"
                />
              </label>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
        <FormRichText
          label="Judul form"
          title
          value={value.titleDoc}
          fallback={title}
          disabled={disabled || uploading}
          onChange={(doc, text) =>
            onChange({ title: text, presentation: { ...value, titleDoc: doc } })
          }
        />
        <FormRichText
          label="Deskripsi form"
          value={value.descriptionDoc}
          fallback={description}
          disabled={disabled || uploading}
          onChange={(doc, text) =>
            onChange({
              description: text,
              presentation: { ...value, descriptionDoc: doc },
            })
          }
        />
      </div>
    </section>
  );
}
