// SendGrid integration helper - uses Replit SendGrid connector
import sgMail from '@sendgrid/mail';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email };
}

export async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
  };
}

export async function sendDailyReportEmail(
  recipientEmails: { email: string; name?: string | null }[],
  projectName: string,
  reportDate: string,
  pdfBuffer: Buffer
): Promise<void> {
  if (recipientEmails.length === 0) return;

  try {
    const { client, fromEmail } = await getUncachableSendGridClient();

    const msg = {
      to: recipientEmails.map(r => ({ email: r.email, name: r.name || undefined })),
      from: { email: fromEmail, name: 'SiteTech Reports' },
      subject: `Daily Report - ${projectName} - ${reportDate}`,
      text: `Please find attached the daily report for ${projectName} dated ${reportDate}.`,
      html: `<p>Please find attached the daily report for <strong>${projectName}</strong> dated <strong>${reportDate}</strong>.</p><p>This report was automatically sent upon signing.</p>`,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: `Daily_Report_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${reportDate}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment' as const,
        },
      ],
    };

    await client.send(msg);
    console.log(`[SendGrid] Daily report emailed to ${recipientEmails.length} recipient(s) for project "${projectName}"`);
  } catch (err) {
    console.error('[SendGrid] Failed to send daily report email:', err);
  }
}
