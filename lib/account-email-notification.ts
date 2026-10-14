import "server-only";

import nodemailer from "nodemailer";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

export async function sendEmailChangedNotification({ to, name, oldEmail, newEmail = to }: { to: string; name: string; oldEmail: string; newEmail?: string }) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !password || !from) return false;

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const safeName = escapeHtml(name);
  const safeOldEmail = escapeHtml(oldEmail);
  const safeNewEmail = escapeHtml(newEmail);
  await transport.sendMail({
    from,
    to,
    subject: "Your Clickme account email was updated",
    text: `CLICKME\n\nAccount email updated\n\nHello ${name},\n\nYour Clickme account email was successfully updated.\nPrevious email: ${oldEmail}\nNew email: ${newEmail}\n\nThis is an automated notification from Clickme.`,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5">
      <tr>
        <td align="center" style="padding:36px 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #e4e4e7">
            <tr>
              <td style="padding:24px 30px;background:#18181b">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="font-size:22px;font-weight:700;letter-spacing:-0.3px;color:#ffffff">Clickme</td>
                    <td align="right"><span style="display:inline-block;padding:6px 10px;background:#dcfce7;color:#166534;font-size:12px;font-weight:700">ACCOUNT UPDATE</span></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 30px">
                <h2 style="margin:0 0 10px;font-size:28px;line-height:1.25;letter-spacing:-0.5px;color:#18181b">Account email updated</h2>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#52525b">Hello ${safeName}, the email for your Clickme account has been successfully updated.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fafafa;border:1px solid #e4e4e7">
                  <tr><td style="padding:17px 18px 7px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:#71717a">Previous email</td></tr>
                  <tr><td style="padding:0 18px 15px;font-size:15px;line-height:1.5;color:#3f3f46;word-break:break-all">${safeOldEmail}</td></tr>
                  <tr><td style="border-top:1px solid #e4e4e7;padding:15px 18px 7px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:#71717a">New email</td></tr>
                  <tr><td style="padding:0 18px 17px;font-size:15px;line-height:1.5;font-weight:700;color:#18181b;word-break:break-all">${safeNewEmail}</td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 30px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.6;color:#71717a">Automated Clickme notification<br>Please do not reply to this email</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  });
  return true;
}
