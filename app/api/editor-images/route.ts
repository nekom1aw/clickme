import { randomUUID } from "node:crypto";
import sharp from "sharp";
import db from "@/lib/db";
import { currentFormUser, formError, FormError } from "@/lib/native-forms";
import { ensureEditorImages } from "@/lib/editor-images";
export async function POST(request: Request) {
  try {
    const user = await currentFormUser();
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
      throw new FormError("Ukuran gambar maksimal 5 MB.", 413);
    const file = (await request.formData()).get("image");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw new FormError("Pilih gambar JPG, PNG, atau WebP.");
    if (!file.size || file.size > 5 * 1024 * 1024)
      throw new FormError("Ukuran gambar maksimal 5 MB.", 413);
    let contents: Buffer;
    try {
      const source = sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: 25000000,
        animated: false,
      });
      const meta = await source.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format ?? ""))
        throw new Error("Unsupported format");
      contents = await source
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new FormError(
        "Gambar tidak dapat dibaca atau resolusinya terlalu besar.",
      );
    }
    await ensureEditorImages();
    const id = randomUUID();
    await db.execute(
      "INSERT INTO editor_images (id,user_id,contents) VALUES (?,?,?)",
      [id, user, contents],
    );
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return formError(error);
  }
}
