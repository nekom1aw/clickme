export type RichMark =
  | { type: "bold" | "italic" | "underline" }
  | { type: "link"; attrs: { href: string } };
export type RichTextNode =
  { type: "text"; text: string; marks?: RichMark[] } | { type: "hardBreak" };
export type RichDoc = {
  type: "doc";
  content: { type: "paragraph"; content?: RichTextNode[] }[];
};
export type FormPresentation = {
  titleDoc: RichDoc | null;
  descriptionDoc: RichDoc | null;
  imageId: string | null;
  imageX: number;
  imageY: number;
};
export function emptyPresentation(): FormPresentation {
  return {
    titleDoc: null,
    descriptionDoc: null,
    imageId: null,
    imageX: 50,
    imageY: 50,
  };
}
export function plainRichDoc(text: string): RichDoc {
  return {
    type: "doc",
    content: text
      .split("\n")
      .map((line) => ({
        type: "paragraph",
        ...(line ? { content: [{ type: "text" as const, text: line }] } : {}),
      })),
  };
}
export function richDocText(doc: RichDoc) {
  return doc.content
    .map((p) =>
      (p.content ?? [])
        .map((n) => (n.type === "text" ? n.text : "\n"))
        .join(""),
    )
    .join("\n");
}
export function safeFormLink(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function validateDoc(value: unknown, max: number): RichDoc | null {
  if (value === null || value === undefined) return null;
  const doc = value as RichDoc;
  if (
    !doc ||
    doc.type !== "doc" ||
    !Array.isArray(doc.content) ||
    doc.content.length > max
  )
    throw new Error("Format teks tidak valid.");
  let nodes = 0;
  const content = doc.content.map((p) => {
    if (
      !p ||
      p.type !== "paragraph" ||
      (p.content !== undefined && !Array.isArray(p.content))
    )
      throw new Error("Format paragraf tidak valid.");
    return {
      type: "paragraph" as const,
      content: (p.content ?? []).map((n): RichTextNode => {
        if (++nodes > 6000 || !n) throw new Error("Teks terlalu rumit.");
        if (n.type === "hardBreak") return { type: "hardBreak" };
        if (
          n.type !== "text" ||
          typeof n.text !== "string" ||
          n.text.length > max
        )
          throw new Error("Format teks tidak valid.");
        if (
          n.marks !== undefined &&
          (!Array.isArray(n.marks) || n.marks.length > 4)
        )
          throw new Error("Format teks tidak valid.");
        const marks = (n.marks ?? []).map((m): RichMark => {
          if (m && ["bold", "italic", "underline"].includes(m.type))
            return { type: m.type as "bold" | "italic" | "underline" };
          if (m?.type === "link" && typeof m.attrs?.href === "string") {
            const href = safeFormLink(m.attrs.href);
            if (href && href.length <= 2000)
              return { type: "link", attrs: { href } };
          }
          throw new Error(
            "Tautan atau format teks tidak valid. Gunakan http, https, atau mailto.",
          );
        });
        return {
          type: "text",
          text: n.text,
          ...(marks.length ? { marks } : {}),
        };
      }),
    };
  });
  const result: RichDoc = { type: "doc", content };
  if (richDocText(result).length > max)
    throw new Error(`Teks maksimal ${max} karakter.`);
  return result;
}
export function validatePresentation(value: unknown): FormPresentation {
  if (value === undefined || value === null) return emptyPresentation();
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("Tampilan form tidak valid.");
  const input = value as FormPresentation;
  const imageId = input.imageId ?? null;
  if (
    imageId !== null &&
    (typeof imageId !== "string" || !/^[0-9a-f-]{36}$/.test(imageId))
  )
    throw new Error("Gambar header tidak valid.");
  const imageX = input.imageX ?? 50,
    imageY = input.imageY ?? 50;
  if (
    ![imageX, imageY].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100,
    )
  )
    throw new Error("Posisi gambar tidak valid.");
  return {
    titleDoc: validateDoc(input.titleDoc, 200),
    descriptionDoc: validateDoc(input.descriptionDoc, 5000),
    imageId,
    imageX,
    imageY,
  };
}
