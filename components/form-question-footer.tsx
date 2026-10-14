"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, Ellipsis } from "lucide-react";
import type { FormField } from "@/lib/native-form-fields";

export default function FormQuestionFooter({
  field,
  onChange,
  children,
}: {
  children?: ReactNode;
  field: FormField;
  onChange: (patch: Partial<FormField>) => void;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const option = useRef<HTMLButtonElement>(null);
  const description = useRef<HTMLTextAreaElement>(null);
  const menuId = useId();
  const showDescription = field.description !== undefined;
  useEffect(() => {
    if (!open) return;
    option.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <>
      {showDescription && (
        <label className="mt-4 block text-xs text-white/50">
          Deskripsi pertanyaan
          <textarea
            ref={description}
            rows={2}
            maxLength={2000}
            value={field.description ?? ""}
            placeholder="Tambahkan petunjuk atau penjelasan untuk pertanyaan ini…"
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white"
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>
      )}
      {children}
      <div className="mt-4 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-white/50">
          <input
            type="checkbox"
            className="accent-white"
            checked={field.required}
            onChange={(event) => onChange({ required: event.target.checked })}
          />
          Wajib diisi
        </label>
        <div
          ref={menu}
          className="relative"
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          <button
            ref={trigger}
            type="button"
            aria-label={`Menu pertanyaan ${field.label || "tanpa judul"}`}
            title="Opsi pertanyaan"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            className="rounded-md p-2 text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            onClick={() => setOpen((current) => !current)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <Ellipsis size={20} />
          </button>
          {open && (
            <div
              id={menuId}
              role="menu"
              aria-label="Opsi pertanyaan"
              className="absolute right-0 top-full z-40 mt-1 w-44 rounded-lg border border-white/15 bg-[#242424] p-1.5 shadow-xl"
            >
              <button
                ref={option}
                type="button"
                role="menuitemcheckbox"
                aria-checked={showDescription}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-white/80 outline-none hover:bg-white/10 focus:bg-white/20"
                onClick={() => {
                  onChange({ description: showDescription ? undefined : "" });
                  setOpen(false);
                  if (showDescription) trigger.current?.focus();
                  else
                    requestAnimationFrame(() => description.current?.focus());
                }}
              >
                <span className="size-4">
                  {showDescription && <Check size={16} />}
                </span>
                Deskripsi
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
