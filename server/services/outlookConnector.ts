import { Client } from '@microsoft/microsoft-graph-client';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=outlook',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Outlook not connected');
  }
  return accessToken;
}

export async function getOutlookClient() {
  const accessToken = await getAccessToken();

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

export async function isOutlookConnectorConfigured(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

export async function getConnectedEmail(): Promise<string | null> {
  try {
    const client = await getOutlookClient();
    const profile = await client.api('/me').get();
    return profile.mail || profile.userPrincipalName || null;
  } catch {
    return null;
  }
}

export interface SendEmailOptions {
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  attachments?: Array<{
    name: string;
    contentType: string;
    contentBytes: string;
  }>;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ messageId: string; conversationId: string }> {
  const client = await getOutlookClient();

  const toRecipients = options.to.map(email => ({
    emailAddress: { address: email }
  }));

  const ccRecipients = (options.cc || []).map(email => ({
    emailAddress: { address: email }
  }));

  const message: any = {
    subject: options.subject,
    body: {
      contentType: "HTML",
      content: options.bodyHtml,
    },
    toRecipients,
    ccRecipients,
    attachments: (options.attachments || []).map(att => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: att.name,
      contentType: att.contentType,
      contentBytes: att.contentBytes,
    })),
  };

  const draft = await client.api('/me/messages').post(message);
  await client.api(`/me/messages/${draft.id}/send`).post({});

  return {
    messageId: draft.id,
    conversationId: draft.conversationId,
  };
}

export async function getEmailReplies(conversationId: string): Promise<Array<{
  id: string;
  subject: string;
  bodyPreview: string;
  bodyHtml: string;
  from: { name: string; email: string };
  receivedAt: string;
  hasAttachments: boolean;
}>> {
  const client = await getOutlookClient();

  const result = await client
    .api('/me/messages')
    .filter(`conversationId eq '${conversationId}'`)
    .select('id,subject,bodyPreview,body,from,receivedDateTime,hasAttachments')
    .orderby('receivedDateTime asc')
    .get();

  return (result.value || []).map((msg: any) => ({
    id: msg.id,
    subject: msg.subject,
    bodyPreview: msg.bodyPreview,
    bodyHtml: msg.body?.contentType === 'html' ? msg.body.content : msg.bodyPreview,
    from: {
      name: msg.from?.emailAddress?.name || '',
      email: msg.from?.emailAddress?.address || '',
    },
    receivedAt: msg.receivedDateTime,
    hasAttachments: msg.hasAttachments,
  }));
}
