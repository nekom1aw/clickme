"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  EditorContent,
  useEditor,
  type Editor,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { TextSelection } from "@tiptap/pm/state";
import { DescriptionImage, DescriptionContents, DescriptionVideo } from "./description-media";
import { TableCellStyle } from "./table-cell-style";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import TableCellToolbar from "./table-cell-toolbar";
import StarterKit from "@tiptap/starter-kit";
import type { NestedOptions } from "@tiptap/extension-drag-handle";
import DragHandle, {
  type DragHandleProps,
} from "@tiptap/extension-drag-handle-react";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { ResizableTableRow } from "./resizable-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

const EDITOR_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

function isEditorVideo(file: File) {
  return EDITOR_VIDEO_TYPES.includes(file.type) || /\.(mp4|webm|mov)$/i.test(file.name);
}
import {
  ArrowDownAZ,
  ArrowDownZA,
  Copy,
  Eraser,
  MoveLeft,
  MoveRight,
  MoveDown,
  MoveUp,
  PanelLeftOpen,
  PanelRightOpen,
  Rows3,
  Trash2,
} from "lucide-react";

type TiptapDescriptionProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minHeight?: number;
  bordered?: boolean;
  mode?: "dark" | "light" | "auto";
};

const dragHandlePosition = {
  placement: "left-start" as const,
  strategy: "absolute" as const,
};

const nestedDragOptions: NestedOptions = {
  edgeDetection: "none",
  rules: [
    {
      id: "dragWholeTable",
      evaluate: ({ node, depth, $pos }) => {
        if (node.type.name === "table") {
          return 0;
        }

        for (let currentDepth = 1; currentDepth < depth; currentDepth += 1) {
          if ($pos.node(currentDepth).type.name === "table") {
            return 1000;
          }
        }

        return 0;
      },
    },
  ],
};

export default function TiptapDescription({
  id,
  value,
  onChange,
  onBlur,
  placeholder = "Add description, or write with AI",
  minHeight = 96,
  bordered = false,
  mode = "auto",
}: TiptapDescriptionProps) {
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [imageStatus, setImageStatus] = useState("");
  const imageBusy = useRef(false);
  const [imageUploading, setImageUploading] = useState(false);
  useEffect(() => {
    if (!imageStatus.endsWith("berhasil ditambahkan.") || imageUploading) return;
    const timer = window.setTimeout(() => setImageStatus(""), 2200);
    return () => window.clearTimeout(timer);
  }, [imageStatus, imageUploading]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isAutoDark, setIsAutoDark] = useState(true);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const isDark = mode === "auto" ? isAutoDark : mode === "dark";
  const editor = useEditor({
    extensions: [
      StarterKit,
      DescriptionImage,
      DescriptionVideo,
      DescriptionContents,
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
        handleWidth: 8,
        cellMinWidth: 60,
        lastColumnResizable: true,
      }),
      ResizableTableRow,
      TableCell,
      TableCellStyle,
      TableHeader,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: isDark ? "text-blue-300 underline" : "text-blue-600 underline",
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id,
        class: "tiptap-description outline-none",
      },
      handleDOMEvents: {
        mousedown: (view, event) => {
          const target = event.target;

          if (!(target instanceof Element) || event.button !== 0) {
            return false;
          }

          const cell = target.closest("td, th");

          if (!cell) {
            return false;
          }

          const bounds = cell.getBoundingClientRect();
          if (event.shiftKey || event.detail > 1 || event.clientX >= bounds.right - 8 || event.clientY >= bounds.bottom - 7) return false;
          event.preventDefault();

          try {
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const cellContentPosition = view.posAtDOM(cell, 0);
            const selection = TextSelection.near(
              view.state.doc.resolve(coordinates?.pos ?? cellContentPosition),
              1,
            );

            view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
            view.focus();
            return true;
          } catch {
            return false;
          }
        },
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape" && slashQuery !== null) {
          setSlashQuery(null);
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
      setSlashQuery(getSlashQuery(currentEditor));
      revealDragHandleAtSelection(currentEditor);
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      revealDragHandleAtSelection(currentEditor);
    },
    onFocus: ({ editor: currentEditor }) => {
      revealDragHandleAtSelection(currentEditor);
    },
    onBlur,
  });

  useEffect(() => {
    if (mode !== "auto") {
      return;
    }

    function syncTheme() {
      setIsAutoDark(
        Boolean(wrapperRef.current?.closest(".dark,[data-theme='dark']")),
      );
    }

    const frameId = window.requestAnimationFrame(syncTheme);
    const observer = new MutationObserver(syncTheme);

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [mode]);

  useEffect(() => {
    if (!editor || editor.getHTML() === value) {
      return;
    }

    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor || !wrapperRef.current) {
      return;
    }

    const wrapper = wrapperRef.current;
    const editorElement = editor.view.dom;

    function revealHandleAcrossRow(event: MouseEvent) {
      if (!event.isTrusted || event.buttons !== 0) {
        return;
      }

      const editorRect = editorElement.getBoundingClientRect();
      const target = event.target;
      const isOnDragHandle =
        target instanceof Element &&
        Boolean(target.closest(".tiptap-description-drag-handle"));
      const isOnEditorRow =
        event.clientY >= editorRect.top && event.clientY <= editorRect.bottom;

      if (!isOnEditorRow || isOnDragHandle) {
        return;
      }

      editorElement.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: editorRect.left + 8,
          clientY: event.clientY,
        }),
      );
    }

    wrapper.addEventListener("mousemove", revealHandleAcrossRow, true);

    return () => {
      wrapper.removeEventListener("mousemove", revealHandleAcrossRow, true);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const editorElement = editor.view.dom;
    const wrapperElement = wrapperRef.current;
    let customDropCursor: HTMLDivElement | null = null;

    function hideCustomDropCursor() {
      customDropCursor?.remove();
      customDropCursor = null;
    }

    function hideCustomDropCursorOnLeave(event: DragEvent) {
      if (!editorElement.contains(event.relatedTarget as Node | null)) {
        hideCustomDropCursor();
      }
    }

    function placeDropCursorAtRowEdge(event: DragEvent) {
      if (
        !wrapperElement ||
        !editorElement.hasAttribute("data-description-dragging")
      ) {
        return;
      }

      const blocks = Array.from(editorElement.children).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      if (!blocks.length) {
        return;
      }

      const targetBlock = blocks.reduce((closest, element) => {
        const rect = element.getBoundingClientRect();
        const closestRect = closest.getBoundingClientRect();
        const distance =
          event.clientY < rect.top
            ? rect.top - event.clientY
            : event.clientY > rect.bottom
              ? event.clientY - rect.bottom
              : 0;
        const closestDistance =
          event.clientY < closestRect.top
            ? closestRect.top - event.clientY
            : event.clientY > closestRect.bottom
              ? event.clientY - closestRect.bottom
              : 0;

        return distance < closestDistance ? element : closest;
      });
      const targetRect = targetBlock.getBoundingClientRect();
      const editorRect = editorElement.getBoundingClientRect();
      const wrapperRect = wrapperElement.getBoundingClientRect();
      const placeAfter = event.clientY >= targetRect.top + targetRect.height / 2;
      const cursorY = placeAfter ? targetRect.bottom + 1 : targetRect.top - 1;

      if (!customDropCursor) {
        customDropCursor = document.createElement("div");
        customDropCursor.className = "tiptap-description-drop-cursor";
        wrapperElement.appendChild(customDropCursor);
      }

      Object.assign(customDropCursor.style, {
        left: `${editorRect.left - wrapperRect.left}px`,
        top: `${cursorY - wrapperRect.top}px`,
        width: `${editorRect.width}px`,
      });

    }

    editorElement.addEventListener("dragover", placeDropCursorAtRowEdge, true);
    editorElement.addEventListener("drop", placeDropCursorAtRowEdge, true);
    editorElement.addEventListener("dragleave", hideCustomDropCursorOnLeave);
    document.addEventListener("dragend", hideCustomDropCursor);
    document.addEventListener("drop", hideCustomDropCursor);

    return () => {
      hideCustomDropCursor();
      editorElement.removeEventListener("dragover", placeDropCursorAtRowEdge, true);
      editorElement.removeEventListener("drop", placeDropCursorAtRowEdge, true);
      editorElement.removeEventListener("dragleave", hideCustomDropCursorOnLeave);
      document.removeEventListener("dragend", hideCustomDropCursor);
      document.removeEventListener("drop", hideCustomDropCursor);
    };
  }, [editor]);

  const uploadEditorImage = useCallback(async (file: File) => {
        if (!editor || imageBusy.current) return;
        if (file.size > 5 * 1024 * 1024) { setImageStatus("Ukuran gambar maksimal 5 MB."); return; }
        imageBusy.current = true; setImageUploading(true); setImageStatus("Mengunggah gambar…");
        let bookmark = editor.state.selection.getBookmark();
        const mapPosition = ({ transaction }: { transaction: import("@tiptap/pm/state").Transaction }) => { bookmark = bookmark.map(transaction.mapping); };
        editor.on("transaction", mapPosition);
        try {
          const body = new FormData(); body.set("image", file);
          const response = await fetch("/api/editor-images", { method: "POST", body });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Unggah gambar gagal.");
          if (!editor.isDestroyed) {
            editor.view.dispatch(editor.state.tr.setSelection(bookmark.resolve(editor.state.doc)));
            editor.chain().focus().insertContent({ type: "image", attrs: { src: `/api/editor-images/${data.id}`, alt: file.name } }).run();
            setImageStatus("Gambar berhasil ditambahkan.");
          }
        } catch (error) { setImageStatus(error instanceof Error ? error.message : "Unggah gambar gagal."); }
        finally { editor.off("transaction", mapPosition); imageBusy.current = false; setImageUploading(false); }
  }, [editor]);

  const uploadEditorVideo = useCallback(async (file: File) => {
        if (!editor || imageBusy.current) return;
        if (!isEditorVideo(file)) { setImageStatus("Pilih video MP4 atau WebM."); return; }
        if (file.size > 50 * 1024 * 1024) { setImageStatus("Ukuran video maksimal 50 MB."); return; }
        imageBusy.current = true; setImageUploading(true); setImageStatus("Mengunggah video…");
        let bookmark = editor.state.selection.getBookmark();
        const mapPosition = ({ transaction }: { transaction: import("@tiptap/pm/state").Transaction }) => { bookmark = bookmark.map(transaction.mapping); };
        editor.on("transaction", mapPosition);
        try {
          const body = new FormData(); body.set("video", file);
          const response = await fetch("/api/editor-videos", { method: "POST", body });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Unggah video gagal.");
          if (!editor.isDestroyed) {
            editor.view.dispatch(editor.state.tr.setSelection(bookmark.resolve(editor.state.doc)));
            editor.chain().focus().insertContent({ type: "video", attrs: { src: `/api/editor-videos/${data.id}` } }).run();
            setImageStatus("Video berhasil ditambahkan.");
          }
        } catch (error) { setImageStatus(error instanceof Error ? error.message : "Unggah video gagal."); }
        finally { editor.off("transaction", mapPosition); imageBusy.current = false; setImageUploading(false); }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    const uploadFiles = (files: File[], busyMessage: string) => {
      if (!files.length) return false;
      if (imageBusy.current) { setImageStatus(busyMessage); return true; }
      void (async () => {
        for (const file of files) {
          if (editor.isDestroyed) break;
          if (isEditorVideo(file)) await uploadEditorVideo(file);
          else await uploadEditorImage(file);
        }
      })();
      return true;
    };
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter(item => item.kind === "file" && (item.type.startsWith("image/") || item.type.startsWith("video/")))
        .map(item => item.getAsFile()).filter((file): file is File => file !== null);
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      uploadFiles(files, "Tunggu unggahan selesai, lalu tempel lagi.");
    };
    const drop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith("image/") || isEditorVideo(file));
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      uploadFiles(files, "Tunggu unggahan selesai, lalu jatuhkan lagi.");
    };
    element.addEventListener("paste", paste, true);
    element.addEventListener("drop", drop, true);
    return () => {
      element.removeEventListener("paste", paste, true);
      element.removeEventListener("drop", drop, true);
    };
  }, [editor, uploadEditorImage, uploadEditorVideo]);

  useEffect(() => {
    if (!editor) return;
    const openImage = () => { if (!imageBusy.current) imageInput.current?.click(); };
    const openVideo = () => { if (!imageBusy.current) videoInput.current?.click(); };
    editor.view.dom.addEventListener("description-upload-image", openImage);
    editor.view.dom.addEventListener("description-upload-video", openVideo);
    return () => {
      editor.view.dom.removeEventListener("description-upload-image", openImage);
      editor.view.dom.removeEventListener("description-upload-video", openVideo);
    };
  }, [editor]);

  return (
    <div
      ref={wrapperRef}
      data-tiptap-description
      className={`group/notion-editor relative rounded-md ${
        bordered
          ? `border bg-transparent px-3 py-2 ${
              isDark ? "border-white/10" : "border-black/10"
            }`
          : "px-2 py-2 pl-9"
      }`}
      style={{ minHeight }}
    >
      <DescriptionStyles isDark={isDark} />
      {editor ? (
        <>
          <NotionDragHandle
            editor={editor}
            isDark={isDark}
            onOpenCommands={() => setSlashQuery("")}
          />
          <FloatingFormatBar editor={editor} isDark={isDark} />
          <TableCellToolbar editor={editor} isDark={isDark} />
          <TableInsertControls
            editor={editor}
            wrapperRef={wrapperRef}
            isDark={isDark}
          />
        </>
      ) : null}
      <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) await uploadEditorImage(file);
      }} />
      <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" className="hidden" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) await uploadEditorVideo(file);
      }} />
      {imageStatus && <div role="status" aria-live="polite" className="description-upload-notice pointer-events-none fixed bottom-6 right-6 z-[10000] flex max-w-[calc(100vw-3rem)] items-center gap-2 rounded-md border border-current/15 bg-[var(--background)] px-3 py-2 text-xs font-normal text-[var(--foreground)] shadow-lg">
        {imageUploading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {imageStatus}
      </div>}
      <EditorContent editor={editor} />
      {editor && slashQuery !== null ? (
        <SlashCommandMenu
          editor={editor}
          query={slashQuery}
          isDark={isDark}
          onClose={() => setSlashQuery(null)}
        />
      ) : null}
    </div>
  );
}

function TableInsertControls({
  editor,
  wrapperRef,
  isDark,
}: {
  editor: Editor;
  wrapperRef: RefObject<HTMLDivElement | null>;
  isDark: boolean;
}) {
  type Rect = { left: number; top: number; width: number; height: number };
  const [tableControls, setTableControls] = useState<{
    table: Rect;
    column: Rect;
    row: Rect;
    columnIndex: number;
    columnCount: number;
    rowIndex: number;
    rowCount: number;
    cellPosition: number;
    menuLeft: number;
    menuTop: number;
    rowMenuLeft: number;
    rowMenuTop: number;
    showColumnAdd: boolean;
    showRowAdd: boolean;
  } | null>(null);
  const hoveredTableCell = useRef<Element | null>(null);
  function appendToHoveredTable(axis: "row" | "column") {
    if (!tableControls || !editor.isEditable) return;
    const $cell = editor.state.doc.resolve(tableControls.cellPosition);
    let depth = $cell.depth;
    while (depth > 0 && $cell.node(depth).type.name !== "table") depth--;
    if (!depth) return;
    const tableNode = $cell.node(depth);
    const map = TableMap.get(tableNode);
    const lastCell = $cell.start(depth) + map.map[map.map.length - 1];
    const bookmark = editor.state.selection.getBookmark();
    const chain = editor.chain().setTextSelection(lastCell + 2);
    if (axis === "row") chain.addRowAfter();
    else chain.addColumnAfter();
    chain.command(({ tr }) => {
      tr.setSelection(bookmark.map(tr.mapping).resolve(tr.doc));
      return true;
    }).run();
    editor.view.focus();
  }
  const [contextMenuPoint, setContextMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [rowMenuOpen, setRowMenuOpen] = useState(false);

  const getRelativeRect = useCallback(
    (element: Element): Rect | null => {
      const wrapper = wrapperRef.current;

      if (!wrapper) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();

      return {
        left: rect.left - wrapperRect.left,
        top: rect.top - wrapperRect.top,
        width: rect.width,
        height: rect.height,
      };
    },
    [wrapperRef],
  );

  const updateFromCell = useCallback(
    (cell: Element, pointer?: { x: number; y: number }) => {
      const table = cell.closest("table");
      const row = cell.closest("tr");

      if (!table || !row || !editor.view.dom.contains(table)) {
        return;
      }

      const tableRect = getRelativeRect(table);
      const cellRect = getRelativeRect(cell);
      const rowRect = getRelativeRect(row);

      if (!tableRect || !cellRect || !rowRect) {
        return;
      }

      const rawTableRect = table.getBoundingClientRect();
      const rawCellRect = cell.getBoundingClientRect();
      const edgeSize = 32;

      setTableControls({
        table: tableRect,
        column: {
          left: cellRect.left,
          top: tableRect.top,
          width: cellRect.width,
          height: tableRect.height,
        },
        row: {
          left: tableRect.left,
          top: rowRect.top,
          width: tableRect.width,
          height: rowRect.height,
        },
        columnIndex: Array.from(row.children).indexOf(cell),
        columnCount: row.children.length,
        rowIndex: Array.from(row.parentElement?.children ?? []).indexOf(row),
        rowCount: row.parentElement?.children.length ?? 0,
        cellPosition: editor.view.posAtDOM(cell, 0),
        menuLeft: Math.max(rawTableRect.left, rawCellRect.left),
        menuTop: rawTableRect.top + 4,
        rowMenuLeft: rawTableRect.left + 4,
        rowMenuTop: row.getBoundingClientRect().top + 4,
        showColumnAdd: pointer
          ? pointer.x >= rawTableRect.right - edgeSize
          : false,
        showRowAdd: pointer
          ? pointer.y >= rawTableRect.bottom - edgeSize
          : false,
      });
    },
    [editor, getRelativeRect],
  );

  const updateTableRect = useCallback(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper || editor.isDestroyed) {
      setTableControls(null);
      return;
    }

    if (hoveredTableCell.current && editor.view.dom.contains(hoveredTableCell.current)) {
      updateFromCell(hoveredTableCell.current);
      return;
    }
    const { node } = editor.view.domAtPos(editor.state.selection.from);
    const selectionElement =
      node instanceof Element ? node : node.parentElement;
    const cell = selectionElement?.closest("td, th");

    if (!cell) {
      setTableControls(null);
      return;
    }

    updateFromCell(cell);
  }, [editor, updateFromCell, wrapperRef]);

  useEffect(() => {
    const scheduleUpdate = () => window.requestAnimationFrame(updateTableRect);

    editor.on("selectionUpdate", scheduleUpdate);
    editor.on("transaction", scheduleUpdate);
    editor.on("focus", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    document.addEventListener("scroll", scheduleUpdate, true);
    scheduleUpdate();

    return () => {
      editor.off("selectionUpdate", scheduleUpdate);
      editor.off("transaction", scheduleUpdate);
      editor.off("focus", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      document.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [editor, updateTableRect]);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    function trackTableHover(event: MouseEvent) {
      if (columnMenuOpen || rowMenuOpen) return;
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const cell = target.closest("td, th");

      if (cell && editor.view.dom.contains(cell)) {
        hoveredTableCell.current = cell;
        updateFromCell(cell, { x: event.clientX, y: event.clientY });
        return;
      }

      if (target.closest("[data-table-context-control]")) {
        return;
      }

      const isNearTable = Array.from(
        editor.view.dom.querySelectorAll("table"),
      ).some((table) => {
        const rect = table.getBoundingClientRect();

        return (
          event.clientX >= rect.left - 32 &&
          event.clientX <= rect.right + 28 &&
          event.clientY >= rect.top - 32 &&
          event.clientY <= rect.bottom + 28
        );
      });

      if (!isNearTable) {
        hoveredTableCell.current = null;
        setTableControls(null);
      }
    }

    function openContextMenu(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !editor.isEditable) return;
      const cell = target.closest("td, th");
      if (!cell || !editor.view.dom.contains(cell)) return;
      event.preventDefault();
      event.stopPropagation();
      hoveredTableCell.current = cell;
      updateFromCell(cell);
      selectTableCell(editor, editor.view.posAtDOM(cell, 0));
      setContextMenuPoint({ x: event.clientX, y: event.clientY });
      setRowMenuOpen(false);
      setColumnMenuOpen(true);
    }
    const rightPointerDown = (event: PointerEvent) => {
      if (event.button === 2) openContextMenu(event);
    };
    wrapper.addEventListener("pointerdown", rightPointerDown, true);
    wrapper.addEventListener("contextmenu", openContextMenu, true);
    wrapper.addEventListener("mousemove", trackTableHover);

    return () => {
      wrapper.removeEventListener("mousemove", trackTableHover);
      wrapper.removeEventListener("pointerdown", rightPointerDown, true);
      wrapper.removeEventListener("contextmenu", openContextMenu, true);
    };
  }, [editor, updateFromCell, wrapperRef, columnMenuOpen, rowMenuOpen]);

  useEffect(() => {
    if (!columnMenuOpen) {
      return;
    }

    function closeColumnMenu(event: MouseEvent) {
      if (event.button === 2) return;
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest("[data-table-column-menu]")
      ) {
        return;
      }

      setColumnMenuOpen(false);
    }

    function closeColumnMenuWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setColumnMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeColumnMenu);
    document.addEventListener("keydown", closeColumnMenuWithEscape);

    return () => {
      document.removeEventListener("mousedown", closeColumnMenu);
      document.removeEventListener("keydown", closeColumnMenuWithEscape);
    };
  }, [columnMenuOpen]);

  useEffect(() => {
    if (!rowMenuOpen) {
      return;
    }

    function closeRowMenu(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest("[data-table-row-menu]")
      ) {
        return;
      }

      setRowMenuOpen(false);
    }

    function closeRowMenuWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setRowMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeRowMenu);
    document.addEventListener("keydown", closeRowMenuWithEscape);

    return () => {
      document.removeEventListener("mousedown", closeRowMenu);
      document.removeEventListener("keydown", closeRowMenuWithEscape);
    };
  }, [rowMenuOpen]);

  if (!tableControls) {
    return null;
  }

  const {
    table,
    column,
    row,
    columnIndex,
    columnCount,
    rowIndex,
    rowCount,
    cellPosition,
    menuLeft,
    menuTop,
    rowMenuLeft,
    rowMenuTop,
    showColumnAdd,
    showRowAdd,
  } = tableControls;

  const controlClass = `absolute z-20 flex items-center justify-center rounded-md transition ${
    isDark
      ? "bg-white/[.07] text-white/50 hover:bg-white/12 hover:text-white"
      : "bg-black/[.05] text-black/45 hover:bg-black/10 hover:text-black"
  }`;

  return (
    <>
      <button
        type="button"
        data-table-context-control
        data-table-column-menu
        aria-label="Column options"
        title="Column options"
        onMouseDown={(event) => {
          event.preventDefault();
          selectTableCell(editor, cellPosition);
        }}
        onClick={() => {
          setContextMenuPoint(null);
          setRowMenuOpen(false);
          setColumnMenuOpen((current) => !current);
        }}
        className={`${controlClass} h-6`}
        style={{
          left: column.left,
          top: table.top - 28,
          width: column.width,
        }}
      >
        <span className="pb-1 text-sm tracking-[2px]">...</span>
      </button>
      {columnMenuOpen ? (
        <ColumnOptionsMenu
          editor={editor}
          isDark={isDark}
          left={contextMenuPoint?.x ?? menuLeft}
          top={contextMenuPoint?.y ?? menuTop}
          canMoveLeft={columnIndex > 0}
          canMoveRight={columnIndex < columnCount - 1}
          columnIndex={columnIndex}
          onClose={() => { setColumnMenuOpen(false); setContextMenuPoint(null); }}
        />
      ) : null}
      <button
        type="button"
        data-table-context-control
        data-table-row-menu
        aria-label="Row options"
        title="Row options"
        onMouseDown={(event) => {
          event.preventDefault();
          selectTableCell(editor, cellPosition);
        }}
        onClick={() => {
          setColumnMenuOpen(false);
          setRowMenuOpen((current) => !current);
        }}
        className={`${controlClass} w-6`}
        style={{
          left: table.left - 28,
          top: row.top,
          height: row.height,
        }}
      >
        <span className="text-sm leading-none">⋮</span>
      </button>
      {rowMenuOpen ? (
        <RowOptionsMenu
          editor={editor}
          isDark={isDark}
          left={rowMenuLeft}
          top={rowMenuTop}
          rowIndex={rowIndex}
          canMoveUp={rowIndex > 0}
          canMoveDown={rowIndex < rowCount - 1}
          onClose={() => setRowMenuOpen(false)}
        />
      ) : null}
      <button
        type="button"
        data-table-context-control
        aria-label="Add column"
        title="Add column"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => appendToHoveredTable("column")}
        className={`${controlClass} w-[18px] ${showColumnAdd ? "opacity-100" : "opacity-0 hover:opacity-100"}`}
        style={{
          left: table.left + table.width + 4,
          top: table.top,
          height: table.height,
        }}
      >
        <span className="text-sm leading-none">+</span>
      </button>
      <button
        type="button"
        data-table-context-control
        aria-label="Add row"
        title="Add row"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => appendToHoveredTable("row")}
        className={`${controlClass} h-6 ${showRowAdd ? "opacity-100" : "opacity-0 hover:opacity-100"}`}
        style={{
          left: table.left,
          top: table.top + table.height + 4,
          width: table.width,
        }}
      >
        <span className="text-sm leading-none">+</span>
      </button>
    </>
  );
}

function ColumnOptionsMenu({
  editor,
  isDark,
  left,
  top,
  canMoveLeft,
  canMoveRight,
  columnIndex,
  onClose,
}: {
  editor: Editor;
  isDark: boolean;
  left: number;
  top: number;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  columnIndex: number;
  onClose: () => void;
}) {
  const menuClass = `fixed z-[9999] max-h-[min(70vh,420px)] w-56 overflow-y-auto rounded-lg border p-1 shadow-2xl ${
    isDark
      ? "border-white/10 bg-[#202020] text-white"
      : "border-black/10 bg-white text-black"
  }`;
  const itemClass = `flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition ${
    isDark
      ? "text-white/70 hover:bg-white/10 hover:text-white"
      : "text-black/65 hover:bg-black/5 hover:text-black"
  }`;
  const dividerClass = `my-1 border-t ${
    isDark ? "border-white/10" : "border-black/10"
  }`;

  function run(command: () => void) {
    command();
    onClose();
  }

  const maximumMenuHeight = Math.min(420, window.innerHeight * 0.7);
  const normalizedLeft = Number.isFinite(left) ? left : 8;
  const normalizedTop = Number.isFinite(top) ? top : 8;
  const safeLeft = Math.max(
    8,
    Math.min(normalizedLeft, window.innerWidth - 232),
  );
  const safeTop = Math.max(
    8,
    Math.min(normalizedTop, window.innerHeight - maximumMenuHeight - 8),
  );

  return createPortal(
    <div
      data-table-context-control
      data-table-column-menu
      onMouseDown={event => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); }}
      className={menuClass}
      style={{ left: safeLeft, top: safeTop }}
    >
      {canMoveLeft ? (
        <button
          type="button"
          className={itemClass}
          onClick={() =>
            run(() => moveTableColumn(editor, columnIndex, columnIndex - 1))
          }
        >
          <MoveLeft className="size-3.5" /> Move column left
        </button>
      ) : null}
      {canMoveRight ? (
        <button
          type="button"
          className={itemClass}
          onClick={() =>
            run(() => moveTableColumn(editor, columnIndex, columnIndex + 1))
          }
        >
          <MoveRight className="size-3.5" /> Move column right
        </button>
      ) : null}

      {canMoveLeft || canMoveRight ? <div className={dividerClass} /> : null}

      <button
        type="button"
        className={itemClass}
        onClick={() =>
          run(() => editor.chain().focus().addColumnBefore().run())
        }
      >
        <PanelLeftOpen className="size-3.5" /> Insert column left
      </button>
      <button
        type="button"
        className={itemClass}
        onClick={() =>
          run(() => editor.chain().focus().addColumnAfter().run())
        }
      >
        <PanelRightOpen className="size-3.5" /> Insert column right
      </button>
      <button type="button" className={itemClass} onClick={() => run(() => editor.chain().focus().addRowBefore().run())}>Insert row above</button>
      <button type="button" className={itemClass} onClick={() => run(() => editor.chain().focus().addRowAfter().run())}>Insert row below</button>

      <div className={dividerClass} />

      <button type="button" className={itemClass}>
        <ArrowDownAZ className="size-3.5" /> Sort column A-Z
      </button>
      <button type="button" className={itemClass}>
        <ArrowDownZA className="size-3.5" /> Sort column Z-A
      </button>

      <div className={dividerClass} />

<TableStyleControls editor={editor} axis="column" />
      <button type="button" className={itemClass}>
        <Eraser className="size-3.5" /> Clear column contents
      </button>

      <div className={dividerClass} />

      <button type="button" className={itemClass}>
        <Copy className="size-3.5" /> Duplicate column
      </button>
      <button
        type="button"
        className={`${itemClass} ${isDark ? "text-red-300 hover:text-red-200" : "text-red-600 hover:text-red-700"}`}
        onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
      >
        <Trash2 className="size-3.5" /> Delete column
      </button>
    </div>,
    document.body,
  );
}

function TableStyleControls({ editor, axis }: { editor: Editor; axis: "row" | "column" }) {
  const apply = (color?: string | null, alignment?: string) => {
    const original = editor.state.selection.getBookmark();
    const { $from } = editor.state.selection;
    let depth = $from.depth;
    while (depth > 0 && $from.node(depth).type.name !== "table") depth--;
    if (!depth) return;
    const table = $from.node(depth);
    const start = $from.start(depth);
    let cellDepth = $from.depth;
    while (cellDepth > depth && !["tableCell", "tableHeader"].includes($from.node(cellDepth).type.name)) cellDepth--;
    if (cellDepth === depth) return;
    const cell = $from.before(cellDepth);
    const map = TableMap.get(table);
    const rect = map.findCell(cell - start);
    const anchor = start + map.map[axis === "row" ? rect.top * map.width : rect.left];
    const head = start + map.map[axis === "row" ? rect.top * map.width + map.width - 1 : (map.height - 1) * map.width + rect.left];
    editor.view.dispatch(editor.state.tr.setSelection(new CellSelection(editor.state.doc.resolve(anchor), editor.state.doc.resolve(head))));
    if (alignment) editor.chain().setTextAlign(alignment).run();
    else editor.chain().setCellAttribute("backgroundColor", color ?? null).run();
    editor.view.dispatch(editor.state.tr.setSelection(original.resolve(editor.state.doc)));
  };
  return <div className="space-y-2 px-2 py-2 text-xs">
    <details><summary className="cursor-pointer py-1">Color</summary>
      <div className="flex flex-wrap gap-2 py-2">
        {["#ffffff", "#27272a", "#fee2e2", "#fef3c7", "#dcfce7", "#dbeafe", "#ede9fe"].map(color => <button type="button" key={color} aria-label={`Warna ${color}`} className="size-5 rounded border border-current/20" style={{ backgroundColor: color }} onClick={() => apply(color)} />)}
        <button type="button" onClick={() => apply(null)}>Reset</button>
      </div>
    </details>
    <details><summary className="cursor-pointer py-1">Alignment</summary>
      <div className="flex flex-wrap gap-2 py-2">{["left", "center", "right", "justify"].map(align => <button type="button" key={align} className="rounded border border-current/20 px-2 py-1" onClick={() => apply(undefined, align)}>{align}</button>)}</div>
    </details>
  </div>;
}

function moveTableColumn(editor: Editor, fromIndex: number, toIndex: number) {
  const { state, view } = editor;
  const { $from } = state.selection;
  let tableDepth = -1;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "table") {
      tableDepth = depth;
      break;
    }
  }

  if (tableDepth < 0) {
    return;
  }

  const table = $from.node(tableDepth);
  const tablePosition = $from.before(tableDepth);

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= table.firstChild!.childCount ||
    toIndex >= table.firstChild!.childCount
  ) {
    return;
  }

  const rows = Array.from({ length: table.childCount }, (_, rowIndex) => {
    const row = table.child(rowIndex);
    const cells = Array.from({ length: row.childCount }, (_, cellIndex) =>
      row.child(cellIndex),
    );
    const [movedCell] = cells.splice(fromIndex, 1);

    cells.splice(toIndex, 0, movedCell);
    return row.type.create(row.attrs, cells, row.marks);
  });
  const movedTable = table.type.create(table.attrs, rows, table.marks);
  const transaction = state.tr
    .replaceWith(tablePosition, tablePosition + table.nodeSize, movedTable)
    .scrollIntoView();

  view.dispatch(transaction);
  editor.commands.focus();
}

function RowOptionsMenu({
  editor,
  isDark,
  left,
  top,
  rowIndex,
  canMoveUp,
  canMoveDown,
  onClose,
}: {
  editor: Editor;
  isDark: boolean;
  left: number;
  top: number;
  rowIndex: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: () => void;
}) {
  const menuClass = `fixed z-[9999] max-h-[min(70vh,360px)] w-56 overflow-y-auto rounded-lg border p-1 shadow-2xl ${
    isDark
      ? "border-white/10 bg-[#202020] text-white"
      : "border-black/10 bg-white text-black"
  }`;
  const itemClass = `flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition ${
    isDark
      ? "text-white/70 hover:bg-white/10 hover:text-white"
      : "text-black/65 hover:bg-black/5 hover:text-black"
  }`;
  const dividerClass = `my-1 border-t ${
    isDark ? "border-white/10" : "border-black/10"
  }`;

  function run(command: () => void) {
    command();
    onClose();
  }

  const maximumMenuHeight = Math.min(360, window.innerHeight * 0.7);
  const normalizedLeft = Number.isFinite(left) ? left : 8;
  const normalizedTop = Number.isFinite(top) ? top : 8;
  const safeLeft = Math.max(
    8,
    Math.min(normalizedLeft, window.innerWidth - 232),
  );
  const safeTop = Math.max(
    8,
    Math.min(normalizedTop, window.innerHeight - maximumMenuHeight - 8),
  );

  return createPortal(
    <div
      data-table-context-control
      data-table-row-menu
      onMouseDown={event => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); }}
      className={menuClass}
      style={{ left: safeLeft, top: safeTop }}
    >
      {canMoveUp ? (
        <button
          type="button"
          className={itemClass}
          onClick={() => run(() => moveTableRow(editor, rowIndex, rowIndex - 1))}
        >
          <MoveUp className="size-3.5" /> Move row up
        </button>
      ) : null}
      {canMoveDown ? (
        <button
          type="button"
          className={itemClass}
          onClick={() => run(() => moveTableRow(editor, rowIndex, rowIndex + 1))}
        >
          <MoveDown className="size-3.5" /> Move row down
        </button>
      ) : null}

      {canMoveUp || canMoveDown ? <div className={dividerClass} /> : null}

      <button
        type="button"
        className={itemClass}
        onClick={() => run(() => editor.chain().focus().addRowBefore().run())}
      >
        <Rows3 className="size-3.5" /> Insert row above
      </button>
      <button
        type="button"
        className={itemClass}
        onClick={() => run(() => editor.chain().focus().addRowAfter().run())}
      >
        <Rows3 className="size-3.5" /> Insert row below
      </button>

      <div className={dividerClass} />

<TableStyleControls editor={editor} axis="row" />

      <div className={dividerClass} />

      <button type="button" className={itemClass}>
        <Copy className="size-3.5" /> Duplicate row
      </button>
      <button
        type="button"
        className={`${itemClass} ${isDark ? "text-red-300 hover:text-red-200" : "text-red-600 hover:text-red-700"}`}
        onClick={() => run(() => editor.chain().focus().deleteRow().run())}
      >
        <Trash2 className="size-3.5" /> Delete row
      </button>
    </div>,
    document.body,
  );
}

function moveTableRow(editor: Editor, fromIndex: number, toIndex: number) {
  const { state, view } = editor;
  const { $from } = state.selection;
  let tableDepth = -1;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "table") {
      tableDepth = depth;
      break;
    }
  }

  if (tableDepth < 0) {
    return;
  }

  const table = $from.node(tableDepth);
  const tablePosition = $from.before(tableDepth);

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= table.childCount ||
    toIndex >= table.childCount
  ) {
    return;
  }

  const rows = Array.from({ length: table.childCount }, (_, index) =>
    table.child(index),
  );
  const [movedRow] = rows.splice(fromIndex, 1);

  rows.splice(toIndex, 0, movedRow);
  const movedTable = table.type.create(table.attrs, rows, table.marks);
  const transaction = state.tr
    .replaceWith(tablePosition, tablePosition + table.nodeSize, movedTable)
    .scrollIntoView();

  view.dispatch(transaction);
  editor.commands.focus();
}

function selectTableCell(editor: Editor, position: number) {
  if (!Number.isFinite(position)) {
    return;
  }

  const safePosition = Math.max(
    1,
    Math.min(position, editor.state.doc.content.size),
  );
  const selection = TextSelection.near(editor.state.doc.resolve(safePosition), 1);

  editor.view.dispatch(editor.state.tr.setSelection(selection));
  editor.commands.focus();
}

function NotionDragHandle({
  editor,
  isDark,
  onOpenCommands,
}: {
  editor: Editor;
  isDark: boolean;
  onOpenCommands: () => void;
}) {
  const activeBlockRef = useRef<{
    position: number;
    isEmpty: boolean;
  } | null>(null);
  const dragFallbackRef = useRef<{
    position: number;
    nodeJson: string;
    documentJson: string;
  } | null>(null);
  const [activeBlock, setActiveBlock] = useState<{
    position: number;
    isEmpty: boolean;
  } | null>(null);
  const handleNodeChange = useCallback<
    NonNullable<DragHandleProps["onNodeChange"]>
  >(({ node, pos }) => {
    const nextBlock = node
      ? {
          position: pos,
          isEmpty: node.isTextblock && node.textContent.trim().length === 0,
        }
      : null;

    activeBlockRef.current = nextBlock;

    setActiveBlock((currentBlock) => {
      if (
        currentBlock?.position === nextBlock?.position &&
        currentBlock?.isEmpty === nextBlock?.isEmpty
      ) {
        return currentBlock;
      }

      return nextBlock;
    });
  }, []);

  function openCommands() {
    if (!activeBlock) {
      return;
    }

    editor
      .chain()
      .focus()
      .setTextSelection(activeBlock.position + 1)
      .insertContent("/")
      .run();
    onOpenCommands();
  }

  const clearDraggedBlock = useCallback(() => {
    editor.view.dom.removeAttribute("data-description-dragging");
  }, [editor]);

  const highlightDraggedBlock = useCallback(() => {
    editor.view.dom.setAttribute("data-description-dragging", "true");
    const currentBlock = activeBlockRef.current;

    if (!currentBlock) {
      dragFallbackRef.current = null;
      return;
    }

    const node = editor.state.doc.nodeAt(currentBlock.position);

    dragFallbackRef.current = node
      ? {
          position: currentBlock.position,
          nodeJson: JSON.stringify(node.toJSON()),
          documentJson: JSON.stringify(editor.getJSON()),
        }
      : null;
  }, [editor]);

  useEffect(() => {
    const editorElement = editor.view.dom;
    const clearDraggingState = () => {
      editorElement.removeAttribute("data-description-dragging");
    };

    document.addEventListener("dragend", clearDraggingState);
    document.addEventListener("drop", clearDraggingState);

    return () => {
      clearDraggingState();
      document.removeEventListener("dragend", clearDraggingState);
      document.removeEventListener("drop", clearDraggingState);
    };
  }, [clearDraggedBlock, editor]);

  useEffect(() => {
    function finishDroppedBlock(event: DragEvent) {
      const snapshot = dragFallbackRef.current;

      if (!snapshot) {
        return;
      }

      const coordinates = { x: event.clientX, y: event.clientY };

      window.requestAnimationFrame(() => {
        dragFallbackRef.current = null;

        if (
          editor.isDestroyed ||
          JSON.stringify(editor.getJSON()) !== snapshot.documentJson
        ) {
          return;
        }

        moveDroppedBlockFallback(editor, snapshot, coordinates);
      });
    }

    document.addEventListener("drop", finishDroppedBlock);

    return () => {
      document.removeEventListener("drop", finishDroppedBlock);
    };
  }, [editor]);

  return (
    <DragHandle
      editor={editor}
      nested={nestedDragOptions}
      computePositionConfig={dragHandlePosition}
      onNodeChange={handleNodeChange}
      onElementDragStart={highlightDraggedBlock}
      onElementDragEnd={clearDraggedBlock}
      className={`tiptap-description-drag-handle group/drag z-[9999] flex h-7 w-9 items-center justify-center rounded-md ${
        activeBlock?.isEmpty ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      {activeBlock?.isEmpty ? (
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={openCommands}
          className={`flex size-6 items-center justify-center rounded-md text-[17px] leading-none transition ${
            isDark
              ? "bg-white/[.06] text-white/55 hover:bg-white/10 hover:text-white"
              : "bg-black/[.04] text-black/55 hover:bg-black/[.08] hover:text-black"
          }`}
          aria-label="Add block"
        >
          +
        </button>
      ) : (
        <div
          className={`pointer-events-none grid size-5 grid-cols-2 place-items-center rounded px-[5px] py-1 transition ${
            isDark
              ? "text-white/45 group-hover/drag:bg-white/10 group-hover/drag:text-white"
              : "text-black/45 group-hover/drag:bg-black/5 group-hover/drag:text-black"
          }`}
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} className="size-0.5 rounded-full bg-current" />
          ))}
        </div>
      )}
    </DragHandle>
  );
}

function moveDroppedBlockFallback(
  editor: Editor,
  snapshot: { position: number; nodeJson: string },
  coordinates: { x: number; y: number },
) {
  const { state, view } = editor;
  const sourceNode = state.doc.nodeAt(snapshot.position);

  if (!sourceNode || JSON.stringify(sourceNode.toJSON()) !== snapshot.nodeJson) {
    return;
  }

  const blocks = Array.from(view.dom.children).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  if (!blocks.length) {
    return;
  }
  const targetElement = blocks.reduce((closest, element) => {
    const rect = element.getBoundingClientRect();
    const closestRect = closest.getBoundingClientRect();
    const distance =
      coordinates.y < rect.top
        ? rect.top - coordinates.y
        : coordinates.y > rect.bottom
          ? coordinates.y - rect.bottom
          : 0;
    const closestDistance =
      coordinates.y < closestRect.top
        ? closestRect.top - coordinates.y
        : coordinates.y > closestRect.bottom
          ? coordinates.y - closestRect.bottom
          : 0;

    return distance < closestDistance ? element : closest;
  });

  const targetStart = Math.max(0, view.posAtDOM(targetElement, 0) - 1);
  const targetNode = state.doc.nodeAt(targetStart);

  if (!targetNode) {
    return;
  }

  const targetRect = targetElement.getBoundingClientRect();
  const placeAfter = coordinates.y >= targetRect.top + targetRect.height / 2;
  const insertPosition = targetStart + (placeAfter ? targetNode.nodeSize : 0);
  const sourceEnd = snapshot.position + sourceNode.nodeSize;

  if (insertPosition >= snapshot.position && insertPosition <= sourceEnd) {
    return;
  }

  const transaction = state.tr.delete(snapshot.position, sourceEnd);
  const mappedInsertPosition = transaction.mapping.map(insertPosition);

  transaction.insert(mappedInsertPosition, sourceNode).scrollIntoView();
  view.dispatch(transaction);
  editor.commands.focus();
}

function FloatingFormatBar({
  editor,
  isDark,
}: {
  editor: Editor;
  isDark: boolean;
}) {
  const [openMenu, setOpenMenu] = useState<
    "list" | "text" | "color" | "align" | "link" | null
  >(null);
  const [linkValue, setLinkValue] = useState("");
  const buttonClass = (active = false) =>
    `flex size-7 items-center justify-center rounded-md text-xs font-semibold transition ${
      active
        ? isDark
          ? "bg-white/15 text-white"
          : "bg-black/10 text-black"
        : isDark
          ? "text-white/65 hover:bg-white/10 hover:text-white"
          : "text-black/60 hover:bg-black/5 hover:text-black"
    }`;
  const panelClass = `absolute left-0 top-[calc(100%+6px)] z-[60] rounded-lg border p-1 shadow-2xl ${
    isDark
      ? "border-white/10 bg-[#202020] text-white"
      : "border-black/10 bg-white text-black"
  }`;
  const optionClass = (active = false) =>
    `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
      active
        ? isDark
          ? "bg-white/12 text-white"
          : "bg-black/10 text-black"
        : isDark
          ? "text-white/65 hover:bg-white/10 hover:text-white"
          : "text-black/60 hover:bg-black/5 hover:text-black"
    }`;

  useEffect(() => {
    const closeMenuWithoutSelection = () => {
      if (editor.state.selection.empty) {
        setOpenMenu(null);
      }
    };

    editor.on("selectionUpdate", closeMenuWithoutSelection);

    return () => {
      editor.off("selectionUpdate", closeMenuWithoutSelection);
    };
  }, [editor]);

  function toggleMenu(menu: NonNullable<typeof openMenu>) {
    setOpenMenu((currentMenu) => (currentMenu === menu ? null : menu));
  }

  function applyLink() {
    const href = linkValue.trim();

    if (!href) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href })
        .run();
    }

    setOpenMenu(null);
    setLinkValue("");
  }

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ state }) =>
        state.selection instanceof TextSelection && !state.selection.empty
      }
      options={{
        placement: "top",
        offset: 8,
        flip: true,
        shift: true,
      }}
      className={`z-50 flex items-center gap-0.5 rounded-lg border p-1 shadow-xl ${
        isDark
          ? "border-white/10 bg-[#252525]"
          : "border-black/10 bg-white"
      }`}
    >
      <div className="relative">
        <button
          type="button"
          title="List style"
          style={{ color: isDark ? "rgba(255,255,255,.9)" : "rgba(0,0,0,.82)" }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMenu("list")}
          className={`${buttonClass(
            editor.isActive("bulletList") ||
              editor.isActive("orderedList") ||
              editor.isActive("taskList"),
          )} w-9`}
        >
          {editor.isActive("orderedList")
            ? "1."
            : editor.isActive("taskList")
              ? "✓"
              : "•≡"}
        </button>
        {openMenu === "list" ? (
          <div className={`${panelClass} w-40`}>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().toggleBulletList().run();
                setOpenMenu(null);
              }}
              className={optionClass(editor.isActive("bulletList"))}
            >
              <span className="w-5">•≡</span> Bullet list
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().toggleOrderedList().run();
                setOpenMenu(null);
              }}
              className={optionClass(editor.isActive("orderedList"))}
            >
              <span className="w-5">1.</span> Numbered list
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().toggleTaskList().run();
                setOpenMenu(null);
              }}
              className={optionClass(editor.isActive("taskList"))}
            >
              <span className="w-5">✓</span> To-do list
            </button>
          </div>
        ) : null}
      </div>

      <div className={`mx-0.5 h-5 border-l ${isDark ? "border-white/10" : "border-black/10"}`} />

      <div className="relative">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMenu("text")}
          className={`${buttonClass(openMenu === "text")} w-auto gap-1 px-2`}
        >
          Text <span className="text-[10px] opacity-60">⌄</span>
        </button>
        {openMenu === "text" ? (
          <div className={`${panelClass} w-44`}>
            {[
              ["Text", () => editor.chain().focus().setParagraph().run(), editor.isActive("paragraph")],
              ["Heading 1", () => editor.chain().focus().setHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 })],
              ["Heading 2", () => editor.chain().focus().setHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 })],
              ["Heading 3", () => editor.chain().focus().setHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 })],
              ["Heading 4", () => editor.chain().focus().setHeading({ level: 4 }).run(), editor.isActive("heading", { level: 4 })],
              ["Code block", () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock")],
              ["Quote", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote")],
            ].map(([label, command, active]) => (
              <button
                key={String(label)}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  (command as () => void)();
                  setOpenMenu(null);
                }}
                className={optionClass(Boolean(active))}
              >
                {String(label)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          title="Text color"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMenu("color")}
          className={buttonClass(openMenu === "color")}
        >
          <span className="border-b-2 border-[#ef4444] text-sm">A</span>
        </button>
        {openMenu === "color" ? (
          <ColorMenu
            editor={editor}
            isDark={isDark}
            panelClass={panelClass}
            onClose={() => setOpenMenu(null)}
          />
        ) : null}
      </div>

      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={buttonClass(editor.isActive("bold"))}
      >
        B
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={buttonClass(editor.isActive("italic"))}
      >
        I
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={buttonClass(editor.isActive("underline"))}
      >
        U
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={buttonClass(editor.isActive("strike"))}
      >
        S
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={buttonClass(editor.isActive("code"))}
      >
        {"</>"}
      </button>

      <div className="relative">
        <button
          type="button"
          title="Alignment"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMenu("align")}
          className={buttonClass(openMenu === "align")}
        >
          ≡
        </button>
        {openMenu === "align" ? (
          <div className={`${panelClass} w-36`}>
            {(["left", "center", "right", "justify"] as const).map(
              (alignment) => (
                <button
                  key={alignment}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setTextAlign(alignment).run();
                    setOpenMenu(null);
                  }}
                  className={optionClass(editor.isActive({ textAlign: alignment }))}
                >
                  <span className="w-5">{alignment === "center" ? "≡" : alignment === "right" ? "≣" : alignment === "justify" ? "☰" : "≡"}</span>
                  {alignment[0].toUpperCase() + alignment.slice(1)}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          title="Insert link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setLinkValue(editor.getAttributes("link").href ?? "");
            toggleMenu("link");
          }}
          className={buttonClass(editor.isActive("link"))}
        >
          🔗
        </button>
        {openMenu === "link" ? (
          <div className={`${panelClass} w-64 p-2`}>
            <p className={`mb-1.5 text-[11px] font-semibold ${isDark ? "text-white/55" : "text-black/50"}`}>
              Insert link
            </p>
            <div className="flex gap-1.5">
              <input
                value={linkValue}
                onChange={(event) => setLinkValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink();
                  }
                }}
                autoFocus
                placeholder="https://example.com"
                className={`h-8 min-w-0 flex-1 rounded-md border px-2 text-xs outline-none ${
                  isDark
                    ? "border-white/10 bg-black/20 text-white placeholder:text-white/30 focus:border-white/25"
                    : "border-black/10 bg-black/[.03] text-black placeholder:text-black/30 focus:border-black/25"
                }`}
              />
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={applyLink}
                className="h-8 rounded-md bg-violet-600 px-2.5 text-xs font-semibold text-white hover:bg-violet-500"
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </BubbleMenu>
  );
}

const TEXT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#38bdf8",
  "#8b5cf6",
  "#ec4899",
  "#34d399",
  "#a3a3a3",
];

const HIGHLIGHT_COLORS = [
  "#7f1d1d",
  "#78350f",
  "#713f12",
  "#1e3a8a",
  "#4c1d95",
  "#831843",
  "#064e3b",
  "#404040",
];

function ColorMenu({
  editor,
  isDark,
  panelClass,
  onClose,
}: {
  editor: Editor;
  isDark: boolean;
  panelClass: string;
  onClose: () => void;
}) {
  return (
    <div className={`${panelClass} w-64 p-2`}>
      <p className={`mb-1.5 text-[11px] font-semibold ${isDark ? "text-white/50" : "text-black/45"}`}>
        Text colors
      </p>
      <div className="grid grid-cols-8 gap-1.5">
        {TEXT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.chain().focus().setColor(color).run();
              onClose();
            }}
            className={`flex size-6 items-center justify-center rounded-md border text-xs font-bold transition ${
              isDark
                ? "border-white/15 hover:bg-white/10"
                : "border-black/15 hover:bg-black/5"
            }`}
            style={{ color }}
          >
            A
          </button>
        ))}
      </div>
      <p className={`mb-1.5 mt-3 text-[11px] font-semibold ${isDark ? "text-white/50" : "text-black/45"}`}>
        Text highlights
      </p>
      <div className="grid grid-cols-8 gap-1.5">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.chain().focus().toggleHighlight({ color }).run();
              onClose();
            }}
            className={`size-6 rounded-full border transition hover:ring-2 ${
              isDark
                ? "border-white/20 hover:ring-white/25"
                : "border-black/20 hover:ring-black/20"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          editor.chain().focus().unsetColor().unsetHighlight().run();
          onClose();
        }}
        className={`mt-3 h-8 w-full rounded-md border text-xs font-semibold ${
          isDark
            ? "border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
            : "border-black/10 text-black/55 hover:bg-black/5 hover:text-black"
        }`}
      >
        Remove color
      </button>
    </div>
  );
}

type SlashCommand = {
  title: string;
  icon: string;
  keywords: string[];
  run: (editor: Editor) => void;
};

const slashSections: Array<{ title: string; commands: SlashCommand[] }> = [
  {
    title: "Style",
    commands: [
      {
        title: "Text",
        icon: "T",
        keywords: ["text", "paragraph"],
        run: (editor) => editor.chain().focus().setParagraph().run(),
      },
      {
        title: "Heading 1",
        icon: "H1",
        keywords: ["h1", "heading"],
        run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        title: "Heading 2",
        icon: "H2",
        keywords: ["h2", "heading"],
        run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        title: "Heading 3",
        icon: "H3",
        keywords: ["h3", "heading"],
        run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        title: "Bullet List",
        icon: "☷",
        keywords: ["bullet", "list", "ul"],
        run: (editor) => editor.chain().focus().toggleBulletList().run(),
      },
      {
        title: "Numbered List",
        icon: "1.",
        keywords: ["number", "ordered", "list"],
        run: (editor) => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        title: "To-do list",
        icon: "☑",
        keywords: ["todo", "task", "checkbox", "checklist"],
        run: (editor) => editor.chain().focus().toggleTaskList().run(),
      },
      {
        title: "Blockquote",
        icon: "|",
        keywords: ["quote", "blockquote"],
        run: (editor) => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        title: "Code Block",
        icon: "<>",
        keywords: ["code"],
        run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
      },
    ],
  },
  {
    title: "Insert",
    commands: [
      {
        title: "Mention",
        icon: "@",
        keywords: ["mention", "user"],
        run: (editor) => editor.chain().focus().insertContent("@").run(),
      },
      {
        title: "Emoji",
        icon: "☺",
        keywords: ["emoji", "smile"],
        run: (editor) => editor.chain().focus().insertContent("🙂").run(),
      },
      {
        title: "Table",
        icon: "▦",
        keywords: ["table", "grid"],
        run: (editor) =>
          editor.chain().focus().insertTable({ rows: 2, cols: 2 }).run(),
      },
      {
        title: "Separator",
        icon: "—",
        keywords: ["separator", "divider", "rule", "line"],
        run: (editor) => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        title: "Table of contents",
        icon: "☷",
        keywords: ["toc", "contents", "table of contents"],
        run: (editor) =>
          editor.chain().focus().insertContent({ type: "tableOfContents" }).run(),
      },
    ],
  },
  {
    title: "Upload",
    commands: [
      {
        title: "Image",
        icon: "▧",
        keywords: ["image", "upload", "photo"],
        run: (editor) => editor.view.dom.dispatchEvent(new Event("description-upload-image")),
      },
      {
        title: "Video",
        icon: "▶",
        keywords: ["video", "upload", "mp4", "film"],
        run: (editor) => editor.view.dom.dispatchEvent(new Event("description-upload-video")),
      },
    ],
  },
];

function SlashCommandMenu({
  editor,
  query,
  isDark,
  onClose,
}: {
  editor: Editor;
  query: string;
  isDark: boolean;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState({ query, index: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.toLowerCase();
  const sections = slashSections
    .map((section) => ({
      ...section,
      commands: section.commands.filter((command) =>
        [command.title, command.icon, ...command.keywords]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    }))
    .filter((section) => section.commands.length);

  const commands = sections.flatMap(section => section.commands);
  const activeIndex = selection.query === query ? Math.min(selection.index, commands.length - 1) : 0;
  useEffect(() => {
    const element = editor.view.dom;
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || !commands.length) return;
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === "Escape") { onClose(); return; }
      if (event.key === "Enter") {
        deleteSlashCommand(editor, query); commands[activeIndex].run(editor); onClose(); return;
      }
      setSelection({ query, index: (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + commands.length) % commands.length });
    };
    element.addEventListener("keydown", keydown, true);
    menuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
    return () => element.removeEventListener("keydown", keydown, true);
  }, [editor, query, commands, activeIndex, onClose]);
  if (!sections.length) return null;

  const cursor = editor.view.coordsAtPos(editor.state.selection.from);
  const menuWidth = 256;
  const menuHeight = Math.min(360, window.innerHeight * 0.65);
  const safeLeft = Math.max(
    8,
    Math.min(cursor.left, window.innerWidth - menuWidth - 8),
  );
  const preferredTop = cursor.bottom + 6;
  const safeTop =
    preferredTop + menuHeight <= window.innerHeight - 8
      ? preferredTop
      : Math.max(8, cursor.top - menuHeight - 6);

  return createPortal(
    <div
      ref={menuRef}
      data-floating-popover
      className={`fixed z-[9999] max-h-[min(65vh,360px)] w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl ${
        isDark ? "border-white/10 bg-[#1f1f1f]" : "border-black/10 bg-white"
      }`}
      style={{ left: safeLeft, top: safeTop }}
    >
      {sections.map((section, sectionIndex) => (
        <div key={section.title}>
          {sectionIndex > 0 ? (
            <div
              className={`mx-1 my-2 border-t ${
                isDark ? "border-white/10" : "border-black/10"
              }`}
            />
          ) : null}
          <p
            className={`px-2 py-1.5 text-xs font-semibold ${
              isDark ? "text-white/90" : "text-black/75"
            }`}
          >
            {section.title}
          </p>
          {section.commands.map((command) => (
            <button
              key={command.title}
              data-active={commands[activeIndex] === command}
              onMouseEnter={() => setSelection({ query, index: commands.indexOf(command) })}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                deleteSlashCommand(editor, query);
                command.run(editor);
                onClose();
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                commands[activeIndex] === command
                  ? isDark
                    ? "bg-white/10 text-white"
                    : "bg-black/10 text-black"
                  : isDark
                    ? "text-white/62 hover:bg-white/10 hover:text-white"
                    : "text-black/55 hover:bg-black/5 hover:text-black"
              }`}
            >
              <span
                className={`flex w-7 shrink-0 items-center justify-center font-semibold ${
                  command.title === "Text" ? "text-lg" : "text-sm"
                }`}
              >
                {command.icon}
              </span>
              <span className="min-w-0 truncate text-sm font-medium">
                {command.title}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}

function getSlashQuery(editor: Editor) {
  const { selection } = editor.state;

  if (!selection.empty) {
    return null;
  }

  const textBeforeCursor = selection.$from.parent.textBetween(
    0,
    selection.$from.parentOffset,
    undefined,
    "\ufffc",
  );
  const match = textBeforeCursor.match(/(?:^|\s)\/([\w-]*)$/);

  return match ? match[1] : null;
}

function deleteSlashCommand(editor: Editor, query: string) {
  const to = editor.state.selection.from;
  const from = to - query.length - 1;

  editor.chain().focus().deleteRange({ from, to }).run();
}

function revealDragHandleAtSelection(editor: Editor) {
  window.requestAnimationFrame(() => {
    if (editor.isDestroyed || !editor.isFocused) {
      return;
    }

    const coordinates = editor.view.coordsAtPos(editor.state.selection.from);
    const editorRect = editor.view.dom.getBoundingClientRect();

    editor.view.dom.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: editorRect.left + 8,
        clientY: (coordinates.top + coordinates.bottom) / 2,
      }),
    );
  });
}

function DescriptionStyles({ isDark }: { isDark: boolean }) {
  return (
    <style>{`
      @keyframes description-notice-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .description-upload-notice { animation: description-notice-in 150ms ease-out; }
      @media (prefers-reduced-motion: reduce) {
        .description-upload-notice { animation: none; }
      }
      .tiptap-description {
        min-height: 100%;
        color: ${isDark ? "rgba(255,255,255,.76)" : "rgba(0,0,0,.76)"};
        font-size: 14px;
        line-height: 1.65;
      }
      .tiptap-description p {
        margin: 0 0 .45rem;
      }
      .tiptap-description :is(h1, h2, h3, h4, h5, h6) {
        font-weight: 700;
        line-height: 1.3;
        margin: 1.1em 0 .45em;
        overflow-wrap: anywhere;
      }
      .tiptap-description h1 { font-size: 2em; }
      .tiptap-description h2 { font-size: 1.65em; }
      .tiptap-description h3 { font-size: 1.35em; }
      .tiptap-description h4 { font-size: 1.15em; }
      .tiptap-description h5 { font-size: 1.05em; }
      .tiptap-description h6 { font-size: 1em; }
      .tiptap-description > :is(h1, h2, h3, h4, h5, h6):first-child {
        margin-top: 0;
      }
      .tiptap-description[data-description-dragging="true"] .ProseMirror-selectednode,
      .tiptap-description[data-description-dragging="true"] .ProseMirror-selectednoderange {
        outline: none;
        border-radius: 5px;
        background: ${isDark ? "rgba(99, 70, 180, .36)" : "rgba(99, 70, 180, .16)"};
      }
      .tiptap-description-drop-cursor {
        position: absolute;
        z-index: 50;
        height: 2px;
        pointer-events: none;
        border-radius: 999px;
        background: ${isDark ? "#8b5cf6" : "#6d28d9"};
      }
      .tiptap-description ul,
      .tiptap-description ol {
        margin: .35rem 0;
        padding-left: 1.2rem;
      }
      .tiptap-description ul:not([data-type="taskList"]) {
        list-style-type: disc;
      }
      .tiptap-description ol {
        list-style-type: decimal;
      }
      .tiptap-description li::marker {
        color: ${isDark ? "rgba(255,255,255,.82)" : "rgba(0,0,0,.72)"};
      }
      .tiptap-description ul[data-type="taskList"] {
        list-style: none;
        padding-left: 0;
      }
      .tiptap-description ul[data-type="taskList"] li {
        display: flex;
        gap: .5rem;
        align-items: flex-start;
      }
      .tiptap-description ul[data-type="taskList"] li > label {
        margin-top: .15rem;
      }
      .tiptap-description ul[data-type="taskList"] input {
        accent-color: #7c3aed;
      }
      .tiptap-description blockquote {
        margin: .55rem 0;
        padding-left: .75rem;
        border-left: 2px solid ${isDark ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.2)"};
      }
      .tiptap-description pre {
        overflow-x: auto;
        border-radius: 6px;
        background: ${isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.05)"};
        padding: .6rem;
      }
      .tiptap-description table {
        border-collapse: collapse;
        margin: 2.5rem 0 2.5rem 1rem;
        width: calc(100% - 1rem);
        table-layout: fixed;
      }
      .tiptap-description .tableWrapper {
        overflow-x: auto;
      }
      .tiptap-description .row-resize-active > td::after,
      .tiptap-description .row-resize-active > th::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: -2px;
        height: 4px;
        background: ${isDark ? "#f4f4f5" : "#18181b"};
        pointer-events: none;
        z-index: 20;
      }
      .tiptap-description.row-resize-cursor,
      .tiptap-description.row-resize-cursor * {
        cursor: row-resize !important;
      }
      .tiptap-description .column-resize-handle {
        position: absolute;
        top: 0;
        right: -2px;
        bottom: 0;
        width: 4px;
        background: ${isDark ? "#f4f4f5" : "#18181b"};
        pointer-events: none;
        z-index: 20;
      }
      .tiptap-description.resize-cursor,
      .tiptap-description.resize-cursor * {
        cursor: col-resize !important;
      }
      .tiptap-description td,
      .tiptap-description th {
        position: relative;
        border: 1px solid ${isDark ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.16)"};
        min-width: 1em;
        padding: .35rem .45rem;
        vertical-align: top;
        cursor: text;
      }
      .tiptap-description td > p,
      .tiptap-description th > p {
        width: 100%;
        min-height: 1.65em;
        margin: 0;
      }
      .tiptap-description th {
        background: ${isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.04)"};
        font-weight: 600;
      }
      .tiptap-description .is-empty::before {
        content: attr(data-placeholder);
        float: left;
        height: 0;
        color: ${isDark ? "rgba(255,255,255,.35)" : "rgba(0,0,0,.38)"};
        pointer-events: none;
      }
    `}</style>
  );
}
