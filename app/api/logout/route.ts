import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ success: true });
  await destroySession(response);
  return response;
}
