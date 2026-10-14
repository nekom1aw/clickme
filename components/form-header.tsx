import Image from "next/image";
import type { ReactNode } from "react";
import {
  safeFormLink,
  type RichDoc,
  type FormPresentation,
} from "@/lib/form-presentation";

export function FormRichContent({
  doc,
  fallback,
}: {
  doc: RichDoc | null | undefined;
  fallback: string;
}) {
  if (!doc) return <span className="whitespace-pre-wrap">{fallback}</span>;
  return (
    <>
      {doc.content.map((p, i) => (
        <span key={i} className="block min-h-[1.4em]">
          {(p.content ?? []).map((node, j) => {
            if (node.type === "hardBreak") return <br key={j} />;
            let text: ReactNode = node.text;
            for (const mark of node.marks ?? []) {
              if (mark.type === "bold") text = <strong>{text}</strong>;
              if (mark.type === "italic") text = <em>{text}</em>;
              if (mark.type === "underline") text = <u>{text}</u>;
              if (mark.type === "link" && safeFormLink(mark.attrs.href))
                text = (
                  <a
                    href={mark.attrs.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-current underline underline-offset-2"
                  >
                    {text}
                  </a>
                );
            }
            return <span key={j}>{text}</span>;
          })}
        </span>
      ))}
    </>
  );
}
export function FormHeaderImage({
  presentation,
}: {
  presentation: FormPresentation;
}) {
  if (!presentation.imageId) return null;
  return (
    <Image
      unoptimized
      src={`/api/form-images/${presentation.imageId}`}
      width={1600}
      height={900}
      alt="Gambar header form"
      className="aspect-video w-full rounded-xl object-cover"
      style={{
        objectPosition: `${presentation.imageX}% ${presentation.imageY}%`,
      }}
    />
  );
}
export default function FormHeader({
  title,
  description,
  presentation,
}: {
  title: string;
  description: string;
  presentation?: FormPresentation;
}) {
  return (
    <div className="mb-4 space-y-4">
      {presentation?.imageId && <FormHeaderImage presentation={presentation} />}
      <h1 className="break-words text-3xl leading-tight">
        <FormRichContent doc={presentation?.titleDoc} fallback={title} />
      </h1>
      {description && (
        <div className="break-words text-sm leading-6 opacity-65">
          <FormRichContent
            doc={presentation?.descriptionDoc}
            fallback={description}
          />
        </div>
      )}
    </div>
  );
}
