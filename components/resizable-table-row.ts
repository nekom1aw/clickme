import { TableRow } from "@tiptap/extension-table-row";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

type ResizeState = { position: number; height?: number } | null;
const resizeKey = new PluginKey<ResizeState>("tableRowResize");
export const ResizableTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (element) => Number.parseInt(element.style.height) || null,
        renderHTML: ({ height }) => height ? { style: `height: ${Math.max(32, Math.min(2000, Number(height) || 32))}px` } : {},
      },
    };
  },
  addProseMirrorPlugins() {
    let cleanup: (() => void) | undefined;
    return [new Plugin<ResizeState>({
      key: resizeKey,
      state: {
        init: () => null,
        apply(tr, previous) {
          const update = tr.getMeta(resizeKey);
          if (update !== undefined) return update;
          if (!previous) return null;
          const mapped = tr.mapping.mapResult(previous.position);
          return mapped.deleted ? null : { ...previous, position: mapped.pos };
        },
      },
      view: () => ({ destroy: () => cleanup?.() }),
      props: {
        decorations(state) {
          const active = resizeKey.getState(state);
          if (!active) return null;
          const node = state.doc.nodeAt(active.position);
          if (node?.type.name !== "tableRow") return null;
          return DecorationSet.create(state.doc, [Decoration.node(active.position, active.position + node.nodeSize, {
            class: "row-resize-active",
            ...(active.height !== undefined ? { style: `height: ${active.height}px !important` } : {}),
          })]);
        },
        handleDOMEvents: {
          mousemove(view, event) {
            if (!view.editable || cleanup) return false;
            const cell = (event.target as HTMLElement).closest("td,th");
            const table = cell?.closest("table");
            let position: number | null = null;
            if (cell && table && view.dom.contains(table)) {
              const box = cell.getBoundingClientRect();
              // Leave column edges to the horizontal resize handler.
              if (event.clientX > box.left + 8 && event.clientX < box.right - 8) {
                for (const row of Array.from(table.rows)) {
                  if (Math.abs(event.clientY - row.getBoundingClientRect().bottom) <= 7) {
                    position = view.posAtDOM(row, 0) - 1;
                    break;
                  }
                }
              }
            }
            view.dom.classList.toggle("row-resize-cursor", position !== null);
            if ((resizeKey.getState(view.state)?.position ?? null) !== position)
              view.dispatch(view.state.tr.setMeta(resizeKey, position === null ? null : { position }));
            return false;
          },
          mouseleave(view) {
            if (!cleanup) {
              view.dom.classList.remove("row-resize-cursor");
              view.dispatch(view.state.tr.setMeta(resizeKey, null));
            }
            return false;
          },
          mousedown(view, event) {
            const active = resizeKey.getState(view.state);
            if (!view.editable || event.button !== 0 || !active) return false;
            const row = view.nodeDOM(active.position) as HTMLTableRowElement | null;
            if (!row) return false;
            event.preventDefault();
            const startY = event.clientY;
            const startHeight = row.getBoundingClientRect().height;
            let height = startHeight;
            const move = (e: MouseEvent) => {
              height = Math.max(32, Math.min(2000, startHeight + e.clientY - startY));
              const current = resizeKey.getState(view.state);
              if (!current) return;
              view.dispatch(view.state.tr.setMeta(resizeKey, { ...current, height }));
              // Apply to the actual row immediately, including tables with a
              // previously saved inline height. Persist only on mouse release.
              const liveRow = view.nodeDOM(current.position) as HTMLElement | null;
              liveRow?.style.setProperty("height", `${height}px`, "important");
            };
            const finish = () => {
              const current = resizeKey.getState(view.state);
              cleanup?.();
              const node = current && view.state.doc.nodeAt(current.position);
              const tr = view.state.tr.setMeta(resizeKey, null);
              if (current && node?.type.name === "tableRow")
                tr.setNodeMarkup(current.position, undefined, { ...node.attrs, height: Math.round(height) });
              view.dispatch(tr);
            };
            cleanup = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", finish);
              window.removeEventListener("blur", finish);
              view.dom.classList.remove("row-resize-cursor");
              cleanup = undefined;
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", finish);
            window.addEventListener("blur", finish);
            return true;
          },
        },
      },
    })];
  },
});
