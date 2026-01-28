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

async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
  };
}

export async function sendInviteEmail(toEmail: string, role: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    
    const appUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'https://your-app.replit.app';

    const roleName = role === 'admin' ? 'Administrator' : role === 'manager' ? 'Manager' : 'User';
    
    const msg = {
      to: toEmail,
      from: fromEmail,
      subject: 'Welcome to SiteTech - You Have Been Invited!',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #1e293b; border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
              <h1 style="margin: 0; color: #f97316; font-size: 32px; font-weight: bold;">SiteTech</h1>
              <p style="margin: 10px 0 0; color: #94a3b8; font-size: 14px;">Construction Management Platform</p>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px; background-color: #1e293b;">
              <h2 style="margin: 0 0 20px; color: #f8fafc; font-size: 24px;">Welcome to the Team!</h2>
              
              <p style="margin: 0 0 20px; color: #cbd5e1; font-size: 16px; line-height: 1.6;">
                You have been invited to join SiteTech as a <strong style="color: #f97316;">${roleName}</strong>. 
                Our platform helps construction teams manage projects, equipment, daily reports, and more.
              </p>
              
              <div style="background-color: #334155; border-radius: 8px; padding: 24px; margin: 30px 0;">
                <h3 style="margin: 0 0 16px; color: #f8fafc; font-size: 18px;">Getting Started:</h3>
                <ol style="margin: 0; padding-left: 20px; color: #cbd5e1; line-height: 1.8;">
                  <li>Click the button below to access the login page</li>
                  <li>Sign in using your Google account linked to this email address</li>
                  <li>Your account is pre-approved - you'll have immediate access</li>
                  <li>Explore the dashboard to view projects, equipment, and reports</li>
                </ol>
              </div>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${appUrl}" 
                       style="display: inline-block; padding: 16px 40px; background-color: #f97316; color: #ffffff; text-decoration: none; font-size: 18px; font-weight: bold; border-radius: 8px;">
                      Access SiteTech
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #94a3b8; font-size: 14px; text-align: center;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${appUrl}" style="color: #f97316; word-break: break-all;">${appUrl}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #0f172a; text-align: center;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                This is an automated message from SiteTech. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `
Welcome to SiteTech!

You have been invited to join SiteTech as a ${roleName}.

Getting Started:
1. Visit ${appUrl}
2. Sign in using your Google account linked to this email address
3. Your account is pre-approved - you'll have immediate access
4. Explore the dashboard to view projects, equipment, and reports

Access SiteTech: ${appUrl}

This is an automated message from SiteTech. Please do not reply to this email.
      `
    };

    await client.send(msg);
    console.log(`Invite email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send invite email:', error);
    return false;
  }
}
