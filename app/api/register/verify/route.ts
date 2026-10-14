import { NextResponse } from "next/server";
import { EmailVerificationError, verifyEmailCode } from "@/lib/email-verification";
import { createSession } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (!email || code.length !== 6) return NextResponse.json({ error: "Enter the 6-digit verification code." }, { status: 400 });
  try {
    const user = await verifyEmailCode(email, code);
    const response = NextResponse.json({ verified: true, user: { id: user.id, name: user.name, direktorat: user.direktorat ?? "", email: user.email, photoUrl: user.photo_url ?? "" } });
    await createSession(response, user.id);
    return response;
  } catch (error) {
    if (error instanceof EmailVerificationError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
