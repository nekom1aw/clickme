import { NextResponse } from "next/server";
import { EmailVerificationError, getUnverifiedUser, issueVerificationCode } from "@/lib/email-verification";

export async function POST(request: Request) {
  const email = String((await request.json()).email ?? "").trim().toLowerCase();
  try {
    const user = await getUnverifiedUser(email);
    if (!user) return NextResponse.json({ sent: true });
    await issueVerificationCode(Number(user.id), String(user.email), String(user.name), true);
    return NextResponse.json({ sent: true });
  } catch (error) {
    if (error instanceof EmailVerificationError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
