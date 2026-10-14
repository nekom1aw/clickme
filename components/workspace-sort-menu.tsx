"use client";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
const options = [["default", "Urutan awal"], ["asc", "Nama A–Z"], ["desc", "Nama Z–A"]];
export default function WorkspaceSortMenu({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (!open) return;
    items.current[Math.max(0, options.findIndex(([id]) => id === value))]?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, value]);
  return <div ref={root} className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" aria-label="Urutkan workspace" title="Urutkan workspace" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="sidebar-action-button flex size-6 items-center justify-center rounded bg-white/10 text-white hover:bg-white/15"><FunnelIcon className="size-3.5" aria-hidden="true" /></button>
    {open && <div role="menu" aria-label="Urutkan workspace" className="absolute left-0 top-full z-[100] mt-2 w-40 overflow-hidden rounded-lg border border-white/15 bg-[#202020] shadow-xl" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const current = items.current.findIndex(item => item === document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (current + (event.key === "ArrowDown" ? 1 : -1) + 3) % 3;
        items.current[next]?.focus();
      }
    }}>
      {options.map(([id, label], index) => <button key={id} ref={element => { items.current[index] = element; }} role="menuitemradio" aria-checked={value === id} type="button" onClick={() => { onChange(id); setOpen(false); trigger.current?.focus(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white/80 hover:bg-white/10 focus:bg-white/10 focus:outline-none"><span className="w-3" aria-hidden="true">{value === id ? "✓" : ""}</span>{label}</button>)}
    </div>}
  </div>;
}
