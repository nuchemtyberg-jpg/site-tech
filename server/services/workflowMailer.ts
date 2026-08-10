import { getProjectStatusLabel } from "@shared/projectStatus";

// Workflow email notifications — reuses the existing Mailgun infrastructure
// (same env config as dailyReportMailer). Sent non-blocking and only when a
// workflow rule enables email notification.

function getAppUrl(): string {
  return process.env.REPLIT_DEPLOYMENT_URL
    ? process.env.REPLIT_DEPLOYMENT_URL
    : process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "https://sitetech-app.replit.app";
}

export async function sendWorkflowEmail(params: {
  toEmail: string;
  toName: string | null;
  projectId: number;
  projectName: string;
  previousStatus: string | null;
  newStatus: string;
  todoTitle: string | null;
  todoDueDate: string | null;
  ruleName: string;
}): Promise<void> {
  const mailgunApiKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const fromEmail = process.env.MAILGUN_FROM_EMAIL;
  const mailgunApiBase = process.env.MAILGUN_API_BASE || "https://api.mailgun.net/v3";

  if (!mailgunApiKey || !mailgunDomain || !fromEmail) {
    console.error("[WorkflowEmail] Mailgun not configured - missing MAILGUN_API_KEY, MAILGUN_DOMAIN, or MAILGUN_FROM_EMAIL");
    return;
  }

  try {
    const appUrl = getAppUrl();
    const projectUrl = `${appUrl}/projects/${params.projectId}?tab=todos`;
    const newStatusLabel = getProjectStatusLabel(params.newStatus);
    const prevStatusLabel = params.previousStatus ? getProjectStatusLabel(params.previousStatus) : null;
    const assigneeName = params.toName || params.toEmail;

    const whatHappened = prevStatusLabel
      ? `${params.projectName} moved from ${prevStatusLabel} to ${newStatusLabel}.`
      : `${params.projectName} moved to ${newStatusLabel}.`;

    const dueText = params.todoDueDate ? `Due: ${params.todoDueDate}` : "No due date";

    const todoSection = params.todoTitle
      ? `
              <div style="background-color: #334155; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0 0 6px; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">New Todo Assigned to ${assigneeName}</p>
                <p style="margin: 0 0 6px; color: #f8fafc; font-size: 18px; font-weight: bold;">${params.todoTitle}</p>
                <p style="margin: 0; color: #cbd5e1; font-size: 14px;">${dueText}</p>
              </div>`
      : "";

    const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #1e293b; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 32px 40px 24px; text-align: center; background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
              <h1 style="margin: 0; color: #f97316; font-size: 28px; font-weight: bold;">SiteTech</h1>
              <p style="margin: 8px 0 0; color: #94a3b8; font-size: 13px;">Workflow Notification</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; background-color: #1e293b;">
              <h2 style="margin: 0 0 16px; color: #f8fafc; font-size: 20px;">${params.projectName}</h2>
              <p style="margin: 0 0 8px; color: #cbd5e1; font-size: 15px; line-height: 1.6;">${whatHappened}</p>
              ${todoSection}
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${projectUrl}"
                       style="display: inline-block; padding: 14px 36px; background-color: #f97316; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 8px;">
                      Open in SiteTech
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; background-color: #0f172a; text-align: center;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                Automated workflow notification (rule: ${params.ruleName}). Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textLines = [
      `SiteTech Workflow Notification`,
      ``,
      whatHappened,
    ];
    if (params.todoTitle) {
      textLines.push(``, `New Todo assigned to ${assigneeName}: ${params.todoTitle}`, dueText);
    }
    textLines.push(``, `Open in SiteTech: ${projectUrl}`);

    const formData = new FormData();
    formData.append("from", `SiteTech <${fromEmail}>`);
    formData.append("to", params.toName ? `${params.toName} <${params.toEmail}>` : params.toEmail);
    formData.append("subject", `${params.projectName} — ${newStatusLabel}${params.todoTitle ? `: ${params.todoTitle}` : ""}`);
    formData.append("html", htmlContent);
    formData.append("text", textLines.join("\n"));

    const response = await fetch(`${mailgunApiBase}/${mailgunDomain}/messages`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`api:${mailgunApiKey}`).toString("base64"),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WorkflowEmail] Mailgun API error: ${response.status} - ${errorText}`);
      return;
    }

    console.log(`[WorkflowEmail] Sent workflow email to ${params.toEmail} for project "${params.projectName}"`);
  } catch (err) {
    console.error("[WorkflowEmail] Failed to send workflow email:", err);
  }
}
