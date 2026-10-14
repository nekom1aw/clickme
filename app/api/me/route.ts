import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type UserRow = DbRow & {
  id: number;
  name: string;
  direktorat: string | null;
  email: string;
  photo_url: string | null;
};

export async function GET() {
  const userId = await getSessionUserId();

  if (!userId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const [rows] = await db.query<UserRow[]>(
    `SELECT id, name, direktorat, email, photo_url
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId],
  );

  const user = rows[0];

  if (!user) {
    return NextResponse.json({ user: null }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      direktorat: user.direktorat ?? "",
      email: user.email,
      photoUrl: user.photo_url ?? "",
    },
  });
}
