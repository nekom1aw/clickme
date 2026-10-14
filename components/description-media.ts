import { Node, mergeAttributes } from "@tiptap/core";
export const DescriptionImage = Node.create({
  name: "image", group: "block", atom: true, draggable: true,
  addAttributes() {
    return {
      src: { default: null }, alt: { default: "" },
      width: { default: 100, parseHTML: element => Number(element.getAttribute("data-width")) || 100, renderHTML: attrs => ({ "data-width": attrs.width }) },
      ratio: { default: "auto", parseHTML: element => element.getAttribute("data-ratio") || "auto", renderHTML: attrs => ({ "data-ratio": attrs.ratio }) },
    };
  },
  parseHTML() { return [{ tag: 'img[src^="/api/editor-images/"]' }]; },
  renderHTML({ HTMLAttributes }) {
    const width = Math.max(10, Math.min(100, Number(HTMLAttributes["data-width"]) || 100));
    const ratio = ["1/1", "4/3", "16/9", "3/4"].includes(HTMLAttributes["data-ratio"]) ? HTMLAttributes["data-ratio"] : "auto";
    return ["img", mergeAttributes(HTMLAttributes, { style: `width:${width}%;max-width:100%;height:auto;aspect-ratio:${ratio};object-fit:cover;border-radius:0;margin:12px 0` })];
  },
  addNodeView() {
    return ({ node: initial, editor, getPos }) => {
      let node = initial;
      const dom = document.createElement("div"); dom.contentEditable = "false";
      dom.style.cssText = "margin:12px 0;max-width:100%";
      const img = document.createElement("img");
      const controls = document.createElement("div");
      controls.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 0;font-size:12px";
      const frame = document.createElement("div");
      frame.style.cssText = "position:relative;max-width:100%";
      const handle = document.createElement("button");
      handle.type = "button"; handle.setAttribute("aria-label", "Ubah ukuran gambar");
      handle.title = "Tarik sudut untuk mengubah ukuran gambar";
      handle.style.cssText = "position:absolute;right:-5px;bottom:-5px;width:16px;height:16px;border:2px solid #fff;border-radius:3px;background:#18181b;cursor:nwse-resize;touch-action:none;z-index:2";
      const value = document.createElement("span");
      frame.append(img, handle);
      const ratioLabel = document.createElement("label"); ratioLabel.textContent = "Rasio ";
      const ratio = document.createElement("select"); ratio.setAttribute("aria-label", "Rasio gambar");
      for (const [id, text] of [["auto", "Asli"], ["1/1", "1:1"], ["4/3", "4:3"], ["16/9", "16:9"], ["3/4", "3:4"]]) {
        const option = document.createElement("option"); option.value = id; option.textContent = text; ratio.append(option);
      }
      ratio.style.cssText = "color:inherit;background:transparent;border:1px solid currentColor;border-radius:4px;padding:4px";
      ratioLabel.append(ratio); controls.append(value, ratioLabel); dom.append(frame, controls);
      const update = () => {
        img.src = node.attrs.src; img.alt = node.attrs.alt || "";
        img.style.cssText = `display:block;width:100%;max-width:100%;height:auto;aspect-ratio:${node.attrs.ratio};object-fit:cover;border-radius:0`;
        frame.style.width = `${node.attrs.width}%`;
        handle.hidden = !editor.isEditable;
        value.textContent = `${node.attrs.width}%`; ratio.value = node.attrs.ratio;
        controls.hidden = !editor.isEditable;
      };
      const save = (attrs: Record<string, unknown>) => {
        const position = getPos();
        if (typeof position === "number") editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, ...attrs }));
      };
      let cancelDrag: (() => void) | undefined;
      handle.onpointerdown = event => {
        if (!editor.isEditable || event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        const startX = event.clientX, startY = event.clientY;
        const startWidth = frame.getBoundingClientRect().width;
        const parentWidth = dom.getBoundingClientRect().width;
        const aspect = startWidth / Math.max(1, img.getBoundingClientRect().height);
        let width = Number(node.attrs.width);
        handle.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => {
          const dx = e.clientX - startX, dy = (e.clientY - startY) * aspect;
          width = Math.round(Math.max(10, Math.min(100, (startWidth + (Math.abs(dx) >= Math.abs(dy) ? dx : dy)) / parentWidth * 100)));
          frame.style.width = `${width}%`; value.textContent = `${width}%`;
        };
        const end = () => { cancelDrag?.(); save({ width }); };
        const cancel = () => { cancelDrag?.(); update(); };
        cancelDrag = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", end);
          handle.removeEventListener("pointercancel", cancel);
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
          cancelDrag = undefined;
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", cancel);
      };
      handle.onkeydown = event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); save({ width: Math.max(10, Math.min(100, Number(node.attrs.width) + (event.key === "ArrowRight" ? 5 : -5))) });
      };
      ratio.onchange = () => save({ ratio: ratio.value });
      update();
      return {
        dom, stopEvent: event => controls.contains(event.target as globalThis.Node) || handle.contains(event.target as globalThis.Node), ignoreMutation: () => true,
        destroy: () => cancelDrag?.(),
        update(next) { if (next.type !== node.type) return false; node = next; update(); return true; },
      };
    };
  },
});
export const DescriptionVideo = Node.create({
  name: "video", group: "block", atom: true, draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      width: { default: 100, parseHTML: element => Number(element.getAttribute("data-width")) || 100, renderHTML: attrs => ({ "data-width": attrs.width }) },
      ratio: { default: "auto", parseHTML: element => element.getAttribute("data-ratio") || "auto", renderHTML: attrs => ({ "data-ratio": attrs.ratio }) },
    };
  },
  parseHTML() { return [{ tag: 'video[src^="/api/editor-videos/"]' }]; },
  renderHTML({ HTMLAttributes }) {
    const width = Math.max(10, Math.min(100, Number(HTMLAttributes["data-width"]) || 100));
    const ratio = ["1/1", "4/3", "16/9", "3/4"].includes(HTMLAttributes["data-ratio"]) ? HTMLAttributes["data-ratio"] : "auto";
    return ["video", mergeAttributes(HTMLAttributes, { controls: "true", preload: "metadata", playsinline: "true", style: `width:${width}%;max-width:100%;height:auto;aspect-ratio:${ratio};object-fit:cover;border-radius:0;margin:12px 0` })];
  },
  addNodeView() {
    return ({ node: initial, editor, getPos }) => {
      let node = initial;
      const dom = document.createElement("div"); dom.contentEditable = "false";
      dom.style.cssText = "margin:12px 0;max-width:100%";
      const video = document.createElement("video");
      video.controls = true; video.preload = "metadata"; video.playsInline = true;
      const controls = document.createElement("div");
      controls.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 0;font-size:12px";
      const frame = document.createElement("div");
      frame.style.cssText = "position:relative;max-width:100%";
      const handle = document.createElement("button");
      handle.type = "button"; handle.setAttribute("aria-label", "Ubah ukuran video");
      handle.title = "Tarik sudut untuk mengubah ukuran video";
      handle.style.cssText = "position:absolute;right:-5px;top:-5px;width:16px;height:16px;border:2px solid #fff;border-radius:3px;background:#18181b;cursor:nesw-resize;touch-action:none;z-index:2";
      const value = document.createElement("span");
      frame.append(video, handle);
      const ratioLabel = document.createElement("label"); ratioLabel.textContent = "Rasio ";
      const ratio = document.createElement("select"); ratio.setAttribute("aria-label", "Rasio video");
      for (const [id, text] of [["auto", "Asli"], ["1/1", "1:1"], ["4/3", "4:3"], ["16/9", "16:9"], ["3/4", "3:4"]]) {
        const option = document.createElement("option"); option.value = id; option.textContent = text; ratio.append(option);
      }
      ratio.style.cssText = "color:inherit;background:transparent;border:1px solid currentColor;border-radius:4px;padding:4px";
      ratioLabel.append(ratio); controls.append(value, ratioLabel); dom.append(frame, controls);
      const update = () => {
        const src = node.attrs.src || "";
        const ratioName = ["1/1", "4/3", "16/9", "3/4"].includes(node.attrs.ratio) ? node.attrs.ratio : "auto";
        const width = Math.max(10, Math.min(100, Number(node.attrs.width) || 100));
        if (video.getAttribute("src") !== src) video.setAttribute("src", src);
        video.style.cssText = `display:block;width:100%;max-width:100%;height:auto;aspect-ratio:${ratioName};object-fit:cover;border-radius:0;background:#000`;
        frame.style.width = `${width}%`;
        handle.hidden = !editor.isEditable;
        value.textContent = `${width}%`; ratio.value = ratioName;
        controls.hidden = !editor.isEditable;
      };
      const save = (attrs: Record<string, unknown>) => {
        const position = getPos();
        if (typeof position === "number") editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, ...attrs }));
      };
      let cancelDrag: (() => void) | undefined;
      handle.onpointerdown = event => {
        if (!editor.isEditable || event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        const startX = event.clientX, startY = event.clientY;
        const startWidth = frame.getBoundingClientRect().width;
        const parentWidth = dom.getBoundingClientRect().width;
        const aspect = startWidth / Math.max(1, video.getBoundingClientRect().height);
        let width = Number(node.attrs.width);
        handle.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => {
          const dx = e.clientX - startX, dy = (e.clientY - startY) * aspect;
          width = Math.round(Math.max(10, Math.min(100, (startWidth + (Math.abs(dx) >= Math.abs(dy) ? dx : dy)) / parentWidth * 100)));
          frame.style.width = `${width}%`; value.textContent = `${width}%`;
        };
        const end = () => { cancelDrag?.(); save({ width }); };
        const cancel = () => { cancelDrag?.(); update(); };
        cancelDrag = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", end);
          handle.removeEventListener("pointercancel", cancel);
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
          cancelDrag = undefined;
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", cancel);
      };
      handle.onkeydown = event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault(); save({ width: Math.max(10, Math.min(100, Number(node.attrs.width) + (event.key === "ArrowRight" ? 5 : -5))) });
      };
      ratio.onchange = () => save({ ratio: ratio.value });
      update();
      return {
        dom, stopEvent: event => video.contains(event.target as globalThis.Node) || controls.contains(event.target as globalThis.Node) || handle.contains(event.target as globalThis.Node), ignoreMutation: () => true,
        destroy: () => cancelDrag?.(),
        update(next) { if (next.type !== node.type) return false; node = next; update(); return true; },
      };
    };
  },
});
export const DescriptionContents = Node.create({
  name: "tableOfContents", group: "block", atom: true, draggable: true,
  parseHTML() { return [{ tag: 'nav[data-table-of-contents]' }]; },
  renderHTML() { return ["nav", { "data-table-of-contents": "true" }, "Daftar isi"]; },
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement("nav");
      dom.contentEditable = "false";
      dom.className = "description-contents";
      dom.setAttribute("aria-label", "Daftar isi");
      const render = () => {
        dom.replaceChildren();
        const title = document.createElement("strong"); title.textContent = "Daftar isi"; dom.append(title);
        let count = 0;
        editor.state.doc.descendants((node, position) => {
          if (node.type.name !== "heading") return;
          count++;
          const button = document.createElement("button");
          button.type = "button"; button.textContent = node.textContent || "Heading tanpa judul";
          button.style.cssText = `display:block;text-align:left;padding:4px 0;margin-left:${(node.attrs.level - 1) * 16}px;text-decoration:underline`;
          button.onclick = () => {
            const target = editor.view.nodeDOM(position) as HTMLElement | null;
            target?.scrollIntoView({ behavior: "smooth", block: "center" });
            editor.commands.setTextSelection(position + 1);
            editor.commands.focus(undefined, { scrollIntoView: false });
          };
          dom.append(button);
        });
        if (!count) {
          const hint = document.createElement("p"); hint.textContent = "Tambahkan Heading 1, 2, atau 3 untuk membuat daftar isi."; dom.append(hint);
        }
      };
      render(); editor.on("update", render);
      return { dom, stopEvent: () => true, ignoreMutation: () => true, destroy: () => { editor.off("update", render); } };
    };
  },
});
