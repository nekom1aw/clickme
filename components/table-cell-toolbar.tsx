"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
export default function TableCellToolbar({ editor, isDark }: { editor: Editor; isDark: boolean }) {
  const [target, setTarget] = useState<{ position: number; left: number; top: number } | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = editor.view.dom;
    const open = (event: MouseEvent) => {
      const cell = (event.target as HTMLElement).closest("td,th");
      if (!cell || !element.contains(cell) || !editor.isEditable) return;
      event.preventDefault();
      const position = editor.view.posAtDOM(cell, 0) - 1;
      const rect = cell.getBoundingClientRect();
      setTarget({ position, left: Math.max(8, Math.min(rect.left, window.innerWidth - 348)), top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 290)) });
      setLink(""); setError("");
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(position + 2))));
    };
    element.addEventListener("dblclick", open);
    return () => element.removeEventListener("dblclick", open);
  }, [editor]);
  useEffect(() => {
    if (!target) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setTarget(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setTarget(null); editor.commands.focus(); } };
    document.addEventListener("pointerdown", close, true); document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", escape, true); };
  }, [target, editor]);
  if (!target) return null;
  const apply = (command: () => void, wholeCell = true) => {
    const node = editor.state.doc.nodeAt(target.position);
    if (!node || !["tableCell", "tableHeader"].includes(node.type.name)) { setTarget(null); return; }
    const tr = editor.state.tr;
    tr.setSelection(wholeCell ? TextSelection.create(tr.doc, target.position + 2, target.position + node.nodeSize - 2) : TextSelection.near(tr.doc.resolve(target.position + 2)));
    editor.view.dispatch(tr);
    command();
    // Return to a caret so typing cannot replace all of the cell's contents.
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(target.position + 2))));
  };
  const button = "rounded border border-current/20 px-2 py-1.5 hover:opacity-70";
  return createPortal(<div ref={root} role="dialog" aria-label="Format sel tabel" data-table-context-control data-floating-popover className={`fixed z-[10000] w-[340px] max-w-[calc(100vw-16px)] rounded-lg border p-3 shadow-xl ${isDark ? "border-white/20 bg-[#202020] text-white" : "border-black/15 bg-white text-black"}`} style={{ left: target.left, top: target.top }}>
    <div className="mb-2 flex justify-between text-xs"><strong>Format sel ini</strong><button type="button" aria-label="Tutup" onClick={() => setTarget(null)}>×</button></div>
    <div className="flex flex-wrap gap-2 text-xs" onMouseDown={event => { if ((event.target as HTMLElement).closest("button")) event.preventDefault(); }}>
      <button type="button" className={button} onClick={() => apply(() => editor.commands.toggleBold())}><b>B</b></button>
      <button type="button" className={button} onClick={() => apply(() => editor.commands.toggleItalic())}><i>I</i></button>
      <button type="button" className={button} onClick={() => apply(() => editor.commands.toggleUnderline())}><u>U</u></button>
      <button type="button" className={button} onClick={() => apply(() => editor.commands.toggleBulletList())}>• List</button>
      <select aria-label="Ukuran font" defaultValue="" className={button} onChange={event => apply(() => editor.commands.setFontSize(event.target.value))}><option value="" disabled>Ukuran</option>{[10,12,14,16,18,20,24,32].map(size => <option key={size} value={`${size}px`}>{size}px</option>)}</select>
      <select aria-label="Jenis font" defaultValue="" className={button} onChange={event => apply(() => editor.commands.setFontFamily(event.target.value))}><option value="" disabled>Font</option>{["Arial","Verdana","Georgia","Times New Roman","Courier New"].map(font => <option key={font}>{font}</option>)}</select>
      <select aria-label="Alignment" defaultValue="" className={button} onChange={event => apply(() => editor.commands.setTextAlign(event.target.value))}><option value="" disabled>Alignment</option>{["left","center","right","justify"].map(value => <option key={value}>{value}</option>)}</select>
      <label className="flex items-center gap-1">Teks <input type="color" aria-label="Warna teks" className="h-7 w-8" onChange={event => apply(() => editor.commands.setColor(event.target.value))} /></label>
      <label className="flex items-center gap-1">Latar <input type="color" aria-label="Warna latar sel" className="h-7 w-8" onChange={event => apply(() => editor.commands.setCellAttribute("backgroundColor", event.target.value), false)} /></label>
      <button type="button" className={button} onClick={() => apply(() => editor.commands.setCellAttribute("backgroundColor", null), false)}>Reset latar</button>
    </div>
    <div className="mt-3 flex gap-2 text-xs"><input aria-label="URL hyperlink" placeholder="https://…" value={link} onChange={event => setLink(event.target.value)} className="min-w-0 flex-1 rounded border border-current/20 bg-transparent px-2" /><button type="button" className={button} onClick={() => {
      if (!/^(https?:\/\/|mailto:)/i.test(link.trim())) { setError("Gunakan https://, http://, atau mailto:."); return; }
      apply(() => editor.commands.setLink({ href: link.trim() })); setError("");
    }}>Link</button><button type="button" className={button} onClick={() => apply(() => editor.commands.unsetLink())}>Unlink</button></div>
    {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
  </div>, document.body);
}
