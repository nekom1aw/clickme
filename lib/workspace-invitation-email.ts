import "server-only";

import nodemailer from "nodemailer";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

const roleNames: Record<string, string> = {
  administrator: "Administrator",
  manager: "Manager",
  collaborator: "Collaborator",
};

export async function sendWorkspaceInvitationEmail({
  to,
  workspaceName,
  inviterName,
  role,
  invitationId,
  projectNames = [],
}: {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  invitationId: number;
  projectNames?: string[];
}) {
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
    auth: { user, pass: password.replace(/\s+/g, "") },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const safeWorkspace = escapeHtml(workspaceName);
  const safeInviter = escapeHtml(inviterName);
  const safeRole = escapeHtml(roleNames[role] ?? role);
  const safeProjects = projectNames.map(escapeHtml);
  const isProjectInvitation = safeProjects.length > 0;
  const invitationLabel = isProjectInvitation ? "project" : "workspace";
  const invitationName = isProjectInvitation ? safeProjects.join(", ") : safeWorkspace;
  const appUrl = (process.env.APP_URL ?? "http://localhost:3002").replace(/\/$/, "");
  const acceptUrl = `${appUrl}/team/invitations?invitation=${invitationId}&action=accept#invitation-${invitationId}`;
  const declineUrl = `${appUrl}/team/invitations?invitation=${invitationId}&action=decline#invitation-${invitationId}`;

  await transport.sendMail({
    from,
    to,
    subject: `Invitation to join ${isProjectInvitation ? projectNames.join(", ") : workspaceName} on Clickme`,
    text: isProjectInvitation
      ? `${inviterName} invited you to join the ${projectNames.join(", ")} project in the ${workspaceName} workspace as ${roleNames[role] ?? role}. Sign in to Clickme and open Messages to accept or decline the invitation.`
      : `${inviterName} invited you to join the ${workspaceName} workspace as ${roleNames[role] ?? role}. Sign in to Clickme and open Messages to accept or decline the invitation.`,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5">
      <tr><td align="center" style="padding:36px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #e4e4e7">
          <tr><td style="padding:24px 30px;background:#18181b;color:#ffffff;font-size:22px;font-weight:700">Clickme</td></tr>
          <tr><td style="padding:34px 30px">
            <h2 style="margin:0 0 12px;font-size:28px;line-height:1.25;color:#18181b">New ${invitationLabel} invitation</h2>
            <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#52525b"><strong>${safeInviter}</strong> invited you to join the following ${invitationLabel}.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fafafa;border:1px solid #e4e4e7">
              <tr><td style="padding:17px 18px 7px;font-size:12px;font-weight:700;color:#71717a">${isProjectInvitation ? "PROJECT" : "WORKSPACE"}</td></tr>
              <tr><td style="padding:0 18px 15px;font-size:17px;font-weight:700;color:#18181b">${invitationName}</td></tr>
              ${isProjectInvitation ? `<tr><td style="border-top:1px solid #e4e4e7;padding:15px 18px 7px;font-size:12px;font-weight:700;color:#71717a">WORKSPACE</td></tr><tr><td style="padding:0 18px 17px;font-size:15px;color:#18181b">${safeWorkspace}</td></tr>` : ""}
              <tr><td style="border-top:1px solid #e4e4e7;padding:15px 18px 7px;font-size:12px;font-weight:700;color:#71717a">ROLE</td></tr>
              <tr><td style="padding:0 18px 17px;font-size:15px;color:#18181b">${safeRole}</td></tr>
            </table>
            <p style="margin:22px 0 0;padding:15px 17px;border-left:4px solid #16a34a;background:#f0fdf4;font-size:14px;line-height:1.6;color:#166534">Sign in to Clickme and open <strong>Messages</strong> to accept or decline this invitation.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px"><tr>
              <td style="background:#18181b"><a href="${acceptUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">Accept in Clickme</a></td>
              <td width="10"></td>
              <td style="border:1px solid #d4d4d8"><a href="${declineUrl}" style="display:inline-block;padding:12px 20px;color:#3f3f46;text-decoration:none;font-size:14px;font-weight:700">Decline</a></td>
            </tr></table>
          </td></tr>
          <tr><td align="center" style="padding:20px 30px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.6;color:#71717a">Automated Clickme notification<br>Please do not reply to this email</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  });
  return true;
}
