import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureEditorImages } from "@/lib/editor-images";
import { currentFormUser, formError } from "@/lib/native-forms";
export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    await currentFormUser();
    const { imageId } = await params;
    if (!/^[a-f0-9-]{36}$/.test(imageId)) return new Response(null, { status: 404 });
    await ensureEditorImages();
    const [rows] = await db.query<DbRow[]>("SELECT contents FROM editor_images WHERE id = ?", [imageId]);
    if (!rows.length) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(rows[0].contents), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return formError(error); }
}
