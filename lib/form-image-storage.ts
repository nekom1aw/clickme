import db from "@/lib/db";
import type { DbRow } from "@/lib/db";
import { FormError } from "@/lib/native-forms";
let schema: Promise<void> | undefined;
export function ensureFormImages() {
  return (schema ??= db
    .execute(
      `CREATE TABLE IF NOT EXISTS native_form_images (
    id varchar(36) PRIMARY KEY, user_id integer NOT NULL, contents bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    )
    .then(() => {})
    .catch((e) => {
      schema = undefined;
      throw e;
    }));
}
export async function requireFormImage(
  imageId: string | null | undefined,
  userId: number,
  existingId?: string | null,
) {
  if (!imageId) return;
  await ensureFormImages();
  const [rows] = await db.query<DbRow[]>(
    "SELECT user_id FROM native_form_images WHERE id=?",
    [imageId],
  );
  if (!rows[0] || (rows[0].user_id !== userId && imageId !== existingId))
    throw new FormError("Gambar tidak tersedia. Unggah gambar milikmu.", 403);
}

export async function requireFormOptionImages(
  fields: { optionImages?: { imageId: string }[] }[],
  userId: number,
  existingFields: { optionImages?: { imageId: string }[] }[] = [],
) {
  const existingIds = new Set(
    existingFields.flatMap((f) => (f.optionImages ?? []).map((i) => i.imageId)),
  );
  const imageIds = new Set(
    fields.flatMap((f) => (f.optionImages ?? []).map((i) => i.imageId)),
  );
  for (const id of imageIds)
    await requireFormImage(id, userId, existingIds.has(id) ? id : null);
}
