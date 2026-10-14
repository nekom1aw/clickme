import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureFormImages } from "@/lib/form-image-storage";
import { ensureForms, formError, FormError } from "@/lib/native-forms";
import { getSessionUserId } from "@/lib/session";
export async function GET(
  _request: Request,
  context: { params: Promise<{ imageId: string }> },
) {
  try {
    const { imageId } = await context.params;
    if (!/^[0-9a-f-]{36}$/.test(imageId))
      throw new FormError("Gambar tidak ditemukan.", 404);
    await ensureForms();
    await ensureFormImages();
    const userId = await getSessionUserId();
    const [rows] = await db.query<DbRow[]>(
      `SELECT i.contents FROM native_form_images i WHERE i.id=? AND (
      i.user_id=? OR EXISTS (SELECT 1 FROM native_forms f WHERE (f.presentation::jsonb->>'imageId'=i.id OR jsonb_path_exists(f.fields::jsonb,'$[*].optionImages[*] ? (@.imageId == $id)',jsonb_build_object('id',i.id))) AND (
      f.is_published=1 OR f.owner_id=? OR EXISTS (SELECT 1 FROM workspaces w LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=? WHERE w.id=f.workspace_id AND (w.owner_id=? OR m.role IN ('administrator','manager'))))))`,
      [imageId, userId, userId, userId, userId],
    );
    if (!rows[0]) throw new FormError("Gambar tidak ditemukan.", 404);
    return new Response(new Uint8Array(rows[0].contents), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return formError(error);
  }
}
