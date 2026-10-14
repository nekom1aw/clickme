"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link2,
  Unlink,
} from "lucide-react";
import {
  plainRichDoc,
  safeFormLink,
  type RichDoc,
} from "@/lib/form-presentation";

export default function FormRichText({
  label,
  value,
  fallback,
  title = false,
  disabled = false,
  onChange,
}: {
  label: string;
  value: RichDoc | null;
  fallback: string;
  title?: boolean;
  disabled?: boolean;
  onChange: (doc: RichDoc, text: string) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const selection = useRef({ from: 1, to: 1 });
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        code: false,
        strike: false,
        horizontalRule: false,
        link: false,
        underline: false,
      }),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        autolink: false,
        HTMLAttributes: { class: "text-white underline" },
      }),
      Placeholder.configure({
        placeholder: title ? "Judul form" : "Deskripsi formulir…",
      }),
    ],
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    content: value ?? plainRichDoc(fallback),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        class: `outline-none break-words [&_p]:min-h-[1.5em] [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_p.is-editor-empty:first-child]:before:text-white/30 [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:pointer-events-none ${title ? "text-3xl leading-tight" : "min-h-20 text-sm leading-6"}`,
      },
    },
    onUpdate: ({ editor: current }) =>
      onChange(
        current.getJSON() as RichDoc,
        current.getText({ blockSeparator: "\n" }),
      ),
  });
  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(() => {
    if (!editor) return;
    const next = value ?? plainRichDoc(fallback);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next))
      editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value, fallback]);
  if (!editor)
    return (
      <div className="min-h-24 rounded-lg border border-white/10 p-3 text-white/30">
        {label}…
      </div>
    );
  const tools = [
    {
      name: "Tebal",
      icon: Bold,
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      name: "Miring",
      icon: Italic,
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      name: "Garis bawah",
      icon: UnderlineIcon,
      active: editor.isActive("underline"),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <span className="mr-auto text-xs text-white/40">{label}</span>
        {tools.map((tool) => (
          <button
            type="button"
            key={tool.name}
            aria-label={`${tool.name} — ${label}`}
            title={tool.name}
            aria-pressed={tool.active}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={tool.run}
            className={`rounded-md p-2 hover:bg-white/10 disabled:opacity-40 ${tool.active ? "bg-white/20 text-white" : "text-white/50"}`}
          >
            <tool.icon size={16} />
          </button>
        ))}
        <button
          type="button"
          aria-label={`Sisipkan link — ${label}`}
          title="Sisipkan link"
          aria-pressed={editor.isActive("link")}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            selection.current = {
              from: editor.state.selection.from,
              to: editor.state.selection.to,
            };
            setUrl(editor.getAttributes("link").href ?? "");
            setError("");
            setLinkOpen(true);
          }}
          className="rounded-md p-2 text-white/50 hover:bg-white/10"
        >
          <Link2 size={16} />
        </button>
        <button
          type="button"
          aria-label={`Hapus link — ${label}`}
          title="Hapus link"
          disabled={disabled || !editor.isActive("link")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            editor.chain().focus().extendMarkRange("link").unsetLink().run()
          }
          className="rounded-md p-2 text-white/50 hover:bg-white/10 disabled:opacity-25"
        >
          <Unlink size={16} />
        </button>
      </div>
      <div className="border-b border-white/15 pb-3 focus-within:border-white">
        <EditorContent editor={editor} />
      </div>
      {linkOpen && (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/10 p-3">
          <label className="text-xs text-white/50">
            Alamat tautan
            <input
              autoFocus
              type="url"
              className="mt-2 w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-white"
              placeholder="https://contoh.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setLinkOpen(false);
                  editor.commands.focus();
                }
              }}
            />
          </label>
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {error}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs text-white/50"
              onClick={() => {
                setLinkOpen(false);
                editor.commands.focus();
              }}
            >
              Batal
            </button>
            <button
              type="button"
              className="rounded-md bg-white text-zinc-950 px-3 py-1.5 text-xs"
              onClick={() => {
                const raw = url.trim();
                const href = safeFormLink(
                  /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`,
                );
                if (!raw || !href) {
                  setError(
                    "Masukkan tautan http, https, atau mailto yang valid.",
                  );
                  return;
                }
                const { from, to } = selection.current;
                const chain = editor
                  .chain()
                  .focus()
                  .setTextSelection({ from, to });
                if (from === to && !editor.isActive("link"))
                  chain
                    .insertContent({
                      type: "text",
                      text: href,
                      marks: [{ type: "link", attrs: { href } }],
                    })
                    .run();
                else chain.extendMarkRange("link").setLink({ href }).run();
                setLinkOpen(false);
              }}
            >
              Terapkan link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
