import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import db from "@/lib/db";
import {
  editorVideoPath,
  ensureEditorVideos,
  sniffEditorVideo,
} from "@/lib/editor-videos";
import { currentFormUser, formError, FormError } from "@/lib/native-forms";

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await currentFormUser();
    if (Number(request.headers.get("content-length")) > MAX_BYTES + 1024 * 1024) {
      throw new FormError("Ukuran video maksimal 50 MB.", 413);
    }
    const file = (await request.formData()).get("video");
    if (!(file instanceof File)) throw new FormError("Pilih video MP4 atau WebM.");
    if (!file.size || file.size > MAX_BYTES) {
      throw new FormError("Ukuran video maksimal 50 MB.", 413);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffEditorVideo(bytes);
    if (!sniffed) throw new FormError("Pilih video MP4 atau WebM.");
    await ensureEditorVideos();
    const id = randomUUID();
    const storedName = `${id}${sniffed.extension}`;
    const filePath = editorVideoPath(storedName);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    try {
      await db.execute(
        "INSERT INTO editor_videos (id, user_id, mime, byte_size, stored_name) VALUES (?,?,?,?,?)",
        [id, user, sniffed.mime, bytes.length, storedName],
      );
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return formError(error);
  }
}
