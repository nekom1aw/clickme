"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { fieldTypes, type FormField } from "@/lib/native-form-fields";

const options = Object.entries(fieldTypes) as [FormField["type"], string][];

export default function FormFieldTypePicker({
  value,
  label,
  onChange,
}: {
  value: FormField["type"];
  label: string;
  onChange: (value: FormField["type"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    items.current[options.findIndex(([type]) => type === value)]?.focus({
      preventScroll: true,
    });
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, value]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <div
      ref={container}
      className="relative w-full shrink-0 sm:w-64"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-left text-sm outline-none focus:border-white disabled:opacity-40"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="truncate">{fieldTypes[value]}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          id={id}
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-white/15 bg-[#242424] p-1.5 shadow-xl"
        >
          {options.map(([type, text], index) => (
            <button
              key={type}
              ref={(node) => {
                items.current[index] = node;
              }}
              type="button"
              role="option"
              aria-selected={value === type}
              tabIndex={-1}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2.5 text-left text-sm outline-none hover:bg-white/10 focus:bg-white/20 ${value === type ? "text-white" : "text-white/80"}`}
              onClick={() => {
                onChange(type);
                close();
              }}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowDown")
                  next = (index + 1) % options.length;
                else if (event.key === "ArrowUp")
                  next = (index - 1 + options.length) % options.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = options.length - 1;
                else return;
                event.preventDefault();
                items.current[next]?.focus();
              }}
            >
              <span className="size-4 shrink-0">
                {value === type && <Check size={16} />}
              </span>
              <span>{text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
