import { sendEmailChangedNotification } from "@/lib/account-email-notification";
import { confirmPendingEmail, EmailVerificationError } from "@/lib/email-verification";
import { createInAppMessage } from "@/lib/in-app-messages";
import { getSessionUserId, revokeOtherSessions } from "@/lib/session";

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ error: "Silakan login kembali." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return Response.json({ error: "Masukkan 6 digit kode verifikasi." }, { status: 400 });

  try {
    const { name, oldEmail, newEmail } = await confirmPendingEmail(userId, code);
    await revokeOtherSessions(userId);
    await createInAppMessage(userId, "account", "Account email updated", `Your Clickme account email was changed from ${oldEmail} to ${newEmail}.`);
    // Both addresses are told, so the previous owner notices a change they didn't make.
    const results = await Promise.allSettled([
      sendEmailChangedNotification({ to: newEmail, name, oldEmail }),
      sendEmailChangedNotification({ to: oldEmail, name, oldEmail, newEmail }),
    ]);
    const emailNotificationSent = results.every((result) => result.status === "fulfilled" && result.value);
    return Response.json({ user: { email: newEmail }, emailNotificationSent });
  } catch (error) {
    if (error instanceof EmailVerificationError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
