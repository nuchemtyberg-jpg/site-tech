import { Client } from '@microsoft/microsoft-graph-client';
import { storage } from '../storage';

const AUTH_BASE = "https://login.microsoftonline.com";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

let connectionSettings: any;

async function getReplitConnectorToken(): Promise<string | null> {
  try {
    if (connectionSettings && connectionSettings.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
      return connectionSettings.settings.access_token;
    }

    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? 'repl ' + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

    if (!xReplitToken || !hostname) return null;

    connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=outlook',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
    return accessToken || null;
  } catch {
    return null;
  }
}

async function getUserConnectionToken(userId?: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const conn = await storage.getUserOutlookConnection(userId);
    if (!conn) return null;

    if (conn.expiresAt && new Date(conn.expiresAt).getTime() > Date.now()) {
      return conn.accessToken;
    }

    const refreshed = await refreshUserToken(userId, conn.refreshToken);
    return refreshed;
  } catch {
    return null;
  }
}

async function refreshUserToken(userId: string, refreshToken: string): Promise<string | null> {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  const tenantId = process.env.OUTLOOK_TENANT_ID || "common";

  if (!clientId || !clientSecret) return null;

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "openid profile email offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read",
    });

    const res = await fetch(`${AUTH_BASE}/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);

    const profileRes = await fetch(`${GRAPH_BASE}/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : {};
    const email = profile.mail || profile.userPrincipalName || "";

    await storage.upsertUserOutlookConnection({
      userId,
      email,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt,
    });

    return data.access_token;
  } catch {
    return null;
  }
}

async function getAccessToken(userId?: string): Promise<string> {
  const userToken = await getUserConnectionToken(userId);
  if (userToken) return userToken;

  const replitToken = await getReplitConnectorToken();
  if (replitToken) return replitToken;

  throw new Error('Outlook not connected');
}

export async function getOutlookClient(userId?: string) {
  const accessToken = await getAccessToken(userId);

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

export async function isOutlookConnectorConfigured(userId?: string): Promise<boolean> {
  try {
    await getAccessToken(userId);
    return true;
  } catch {
    return false;
  }
}

export async function getConnectedEmail(userId?: string): Promise<string | null> {
  if (userId) {
    const conn = await storage.getUserOutlookConnection(userId);
    if (conn) return conn.email;
  }

  try {
    const client = await getOutlookClient(userId);
    const profile = await client.api('/me').get();
    return profile.mail || profile.userPrincipalName || null;
  } catch {
    return null;
  }
}

export function getUserConnectUrl(userId: string): string {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const tenantId = process.env.OUTLOOK_TENANT_ID || "common";

  if (!clientId) throw new Error("OUTLOOK_CLIENT_ID not configured");

  const redirectUri = getRedirectUri();
  const scope = "openid profile email offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read";
  const state = `user:${userId}:${Date.now()}`;

  userOAuthStates.set(state, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });

  userOAuthStates.forEach((val, key) => {
    if (val.expiresAt < Date.now()) userOAuthStates.delete(key);
  });

  return `${AUTH_BASE}/${tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_mode=query` +
    `&prompt=consent`;
}

function getRedirectUri(): string {
  if (process.env.APP_BASE_URL) {
    return `${process.env.APP_BASE_URL}/api/outlook/user-callback`;
  }
  const base = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPL_SLUG
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : "http://localhost:5000";
  return `${base}/api/outlook/user-callback`;
}

const userOAuthStates = new Map<string, { userId: string; expiresAt: number }>();

export function validateUserOAuthState(state: string): string | null {
  const entry = userOAuthStates.get(state);
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) userOAuthStates.delete(state);
    return null;
  }
  userOAuthStates.delete(state);
  return entry.userId;
}

export async function exchangeUserCode(code: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; email: string }> {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  const tenantId = process.env.OUTLOOK_TENANT_ID || "common";

  if (!clientId || !clientSecret) throw new Error("Outlook OAuth not configured");

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
    scope: "openid profile email offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read",
  });

  const res = await fetch(`${AUTH_BASE}/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("User token exchange failed:", err);
    throw new Error("Failed to exchange authorization code");
  }

  const data = await res.json();

  const profileRes = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = profileRes.ok ? await profileRes.json() : {};

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    email: profile.mail || profile.userPrincipalName || "",
  };
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

export async function sendEmail(options: SendEmailOptions, userId?: string): Promise<{ messageId: string; conversationId: string }> {
  const client = await getOutlookClient(userId);

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

export async function getEmailReplies(conversationId: string, userId?: string): Promise<Array<{
  id: string;
  subject: string;
  bodyPreview: string;
  bodyHtml: string;
  from: { name: string; email: string };
  receivedAt: string;
  hasAttachments: boolean;
}>> {
  const client = await getOutlookClient(userId);

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

export function isUserOutlookConfigured(): boolean {
  return !!(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET);
}
