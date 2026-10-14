import type { DbRow } from "@/lib/db";
import sharp from "sharp";
import db from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

async function ensurePhotos() {
  await db.execute(`CREATE TABLE IF NOT EXISTS user_profile_photos (
    user_id integer PRIMARY KEY, contents bytea NOT NULL
  )`);
}
export async function POST(request: Request) {
  const id = await getSessionUserId();
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json({ error: "Silakan login kembali." }, { status: 401 });
  const [users] = await db.query<DbRow[]>("SELECT id FROM users WHERE id = ?", [id]);
  if (!users.length) return Response.json({ error: "Silakan login kembali." }, { status: 401 });
  if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
    return Response.json({ error: "Ukuran foto maksimal 5 MB." }, { status: 413 });
  try {
    const file = (await request.formData()).get("photo");
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return Response.json({ error: "Pilih foto JPG, PNG, atau WebP." }, { status: 400 });
    if (!file.size || file.size > 5 * 1024 * 1024)
      return Response.json({ error: "Ukuran foto maksimal 5 MB." }, { status: 413 });
    let contents: Buffer;
    try {
      contents = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25000000 })
        .rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
    } catch {
      return Response.json({ error: "Foto tidak dapat dibaca. Pilih gambar lain." }, { status: 400 });
    }
    await ensurePhotos();
    const photoUrl = `/api/profile/photo?user=${id}&v=${Date.now()}`;
    await db.execute("INSERT INTO user_profile_photos (user_id, contents) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET contents = EXCLUDED.contents", [id, contents]);
    await db.execute("UPDATE users SET photo_url = ? WHERE id = ?", [photoUrl, id]);
    return Response.json({ photoUrl });
  } catch {
    return Response.json({ error: "Foto gagal disimpan. Silakan coba lagi." }, { status: 500 });
  }
}
export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("user"));
  if (!Number.isSafeInteger(id) || id < 1) return new Response(null, { status: 404 });
  await ensurePhotos();
  const [rows] = await db.query<DbRow[]>("SELECT contents FROM user_profile_photos WHERE user_id = ?", [id]);
  if (!rows.length) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(rows[0].contents), { headers: { "Content-Type": "image/webp", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" } });
}
