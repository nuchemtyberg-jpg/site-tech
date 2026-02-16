export async function sendDailyReportEmail(
  recipientEmails: { email: string; name?: string | null }[],
  projectName: string,
  reportDate: string,
  pdfBuffer: Buffer
): Promise<void> {
  if (recipientEmails.length === 0) return;

  const mailgunApiKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const fromEmail = process.env.MAILGUN_FROM_EMAIL;
  const mailgunApiBase = process.env.MAILGUN_API_BASE || 'https://api.mailgun.net/v3';

  if (!mailgunApiKey || !mailgunDomain || !fromEmail) {
    console.error('[AutoEmail] Mailgun not configured - missing MAILGUN_API_KEY, MAILGUN_DOMAIN, or MAILGUN_FROM_EMAIL');
    return;
  }

  try {
    const toList = recipientEmails.map(r => r.name ? `${r.name} <${r.email}>` : r.email).join(', ');
    const sanitizedName = projectName.replace(/[^a-zA-Z0-9 _-]/g, '_');
    const filename = `Daily_Report_${sanitizedName}_${reportDate}.pdf`;

    const formData = new FormData();
    formData.append('from', `SiteTech Reports <${fromEmail}>`);
    formData.append('to', toList);
    formData.append('subject', `Daily Report - ${projectName} - ${reportDate}`);
    formData.append('text', `Please find attached the daily report for ${projectName} dated ${reportDate}.\n\nThis report was automatically sent upon signing.`);
    formData.append('html', `<p>Please find attached the daily report for <strong>${projectName}</strong> dated <strong>${reportDate}</strong>.</p><p>This report was automatically sent upon signing.</p>`);

    const pdfFile = new File([pdfBuffer], filename, { type: 'application/pdf' });
    formData.append('attachment', pdfFile);

    const url = `${mailgunApiBase}/${mailgunDomain}/messages`;
    console.log(`[AutoEmail] Sending via Mailgun: domain=${mailgunDomain}, from=${fromEmail}, to=${toList}, url=${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`api:${mailgunApiKey}`).toString('base64'),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AutoEmail] Mailgun API error: ${response.status} - ${errorText}`);
      return;
    }

    const result = await response.json();
    console.log(`[AutoEmail] Daily report emailed to ${recipientEmails.length} recipient(s) for project "${projectName}"`, result);
  } catch (err) {
    console.error('[AutoEmail] Failed to send daily report email:', err);
  }
}
