import { storage } from "../storage";
import type { ProjectEmailConnection, InsertProjectEmail, InsertProjectEmailAttachment } from "@shared/schema";
import crypto from "crypto";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const AUTH_BASE = "https://login.microsoftonline.com";

const oauthStateNonces = new Map<string, { projectId: number; expiresAt: number }>();

export function createOAuthState(projectId: number): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = `${projectId}:${nonce}`;
  oauthStateNonces.set(state, {
    projectId,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  for (const [key, val] of oauthStateNonces) {
    if (val.expiresAt < Date.now()) oauthStateNonces.delete(key);
  }

  return state;
}

export function validateOAuthState(state: string): number | null {
  const entry = oauthStateNonces.get(state);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    oauthStateNonces.delete(state);
    return null;
  }
  oauthStateNonces.delete(state);
  return entry.projectId;
}

function getClientId(): string {
  const id = process.env.OUTLOOK_CLIENT_ID;
  if (!id) throw new Error("OUTLOOK_CLIENT_ID not configured");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.OUTLOOK_CLIENT_SECRET;
  if (!secret) throw new Error("OUTLOOK_CLIENT_SECRET not configured");
  return secret;
}

function getTenantId(): string {
  return process.env.OUTLOOK_TENANT_ID || "common";
}

export function getRedirectUri(): string {
  if (process.env.APP_BASE_URL) {
    return `${process.env.APP_BASE_URL}/api/outlook/callback`;
  }
  const base = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPL_SLUG
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : "http://localhost:5000";
  return `${base}/api/outlook/callback`;
}

export function isOutlookConfigured(): boolean {
  return !!(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET);
}

export function getAuthUrl(projectId: number): string {
  const clientId = getClientId();
  const tenantId = getTenantId();
  const redirectUri = getRedirectUri();
  const scope = "openid profile email offline_access Mail.Read Mail.ReadBasic User.Read";
  const state = createOAuthState(projectId);

  return `${AUTH_BASE}/${tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_mode=query`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
}> {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const tenantId = getTenantId();
  const redirectUri = getRedirectUri();

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: "openid profile email offline_access Mail.Read Mail.ReadBasic User.Read",
  });

  const res = await fetch(`${AUTH_BASE}/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Token exchange failed:", err);
    throw new Error("Failed to exchange authorization code for tokens");
  }

  const data = await res.json();

  const profileRes = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });

  let email = "";
  if (profileRes.ok) {
    const profile = await profileRes.json();
    email = profile.mail || profile.userPrincipalName || "";
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    email,
  };
}

async function refreshAccessToken(connection: ProjectEmailConnection): Promise<string> {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const tenantId = getTenantId();

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: connection.refreshToken,
    grant_type: "refresh_token",
    scope: "openid profile email offline_access Mail.Read Mail.ReadBasic User.Read",
  });

  const res = await fetch(`${AUTH_BASE}/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    await storage.updateProjectEmailConnection(connection.id, { status: "expired" });
    throw new Error("Failed to refresh Outlook token - re-authorization required");
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await storage.updateProjectEmailConnection(connection.id, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || connection.refreshToken,
    tokenExpiresAt: expiresAt,
    status: "active",
  });

  return data.access_token;
}

async function getValidToken(connection: ProjectEmailConnection): Promise<string> {
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;
  if (connection.tokenExpiresAt.getTime() - bufferMs > now.getTime()) {
    return connection.accessToken;
  }
  return refreshAccessToken(connection);
}

interface OutlookMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: { content: string; contentType: string };
  from: { emailAddress: { address: string; name: string } };
  toRecipients: Array<{ emailAddress: { address: string; name: string } }>;
  ccRecipients: Array<{ emailAddress: { address: string; name: string } }>;
  hasAttachments: boolean;
  receivedDateTime: string;
}

interface OutlookAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export async function syncProjectEmails(projectId: number): Promise<{ synced: number; errors: number }> {
  const connection = await storage.getProjectEmailConnection(projectId);
  if (!connection) throw new Error("No email connection for this project");
  if (connection.status === "expired") throw new Error("Email connection expired - please reconnect");

  const token = await getValidToken(connection);

  const lastSync = connection.lastSyncAt;
  let url = `${GRAPH_BASE}/me/messages?$top=50&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,hasAttachments,receivedDateTime`;

  if (lastSync) {
    const filterDate = lastSync.toISOString();
    url += `&$filter=receivedDateTime ge ${filterDate}`;
  }

  let synced = 0;
  let errors = 0;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        await storage.updateProjectEmailConnection(connection.id, { status: "expired" });
        throw new Error("Email connection expired - please reconnect");
      }
      throw new Error(`Failed to fetch emails: ${res.status}`);
    }

    const data = await res.json();
    const messages: OutlookMessage[] = data.value || [];

    const project = await storage.getProject(projectId);
    const customerEmail = project?.customerId
      ? (await storage.getCustomer(project.customerId))?.email?.toLowerCase()
      : null;

    for (const msg of messages) {
      try {
        const existing = await storage.getProjectEmailByOutlookId(projectId, msg.id);
        if (existing) continue;

        const toEmails = msg.toRecipients?.map(r => r.emailAddress.address) || [];
        const ccEmails = msg.ccRecipients?.map(r => r.emailAddress.address) || [];
        const allRecipients = [...toEmails, ...ccEmails, msg.from.emailAddress.address].map(e => e.toLowerCase());

        const isInternal = customerEmail ? !allRecipients.includes(customerEmail) : false;

        const emailData: InsertProjectEmail = {
          projectId,
          outlookMessageId: msg.id,
          conversationId: msg.conversationId,
          fromEmail: msg.from.emailAddress.address,
          fromName: msg.from.emailAddress.name,
          toEmails,
          ccEmails,
          subject: msg.subject,
          bodyPreview: msg.bodyPreview,
          bodyHtml: msg.body?.contentType === "html" ? msg.body.content : null,
          isInternal,
          hasAttachments: msg.hasAttachments,
          receivedAt: new Date(msg.receivedDateTime),
        };

        const saved = await storage.createProjectEmail(emailData);

        if (msg.hasAttachments) {
          try {
            const attRes = await fetch(
              `${GRAPH_BASE}/me/messages/${msg.id}/attachments?$select=id,name,contentType,size`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (attRes.ok) {
              const attData = await attRes.json();
              const attachments: OutlookAttachment[] = attData.value || [];
              for (const att of attachments) {
                await storage.createProjectEmailAttachment({
                  emailId: saved.id,
                  outlookAttachmentId: att.id,
                  name: att.name,
                  contentType: att.contentType,
                  size: att.size,
                });
              }
            }
          } catch (attErr) {
            console.error("Failed to sync attachments for message:", msg.id, attErr);
          }
        }

        synced++;
      } catch (msgErr) {
        console.error("Failed to sync message:", msg.id, msgErr);
        errors++;
      }
    }

    await storage.updateProjectEmailConnection(connection.id, {
      lastSyncAt: new Date(),
    });
  } catch (err) {
    console.error("Email sync error:", err);
    throw err;
  }

  return { synced, errors };
}

export async function getAttachmentContent(
  projectId: number,
  outlookMessageId: string,
  outlookAttachmentId: string
): Promise<{ content: Buffer; contentType: string; name: string } | null> {
  const connection = await storage.getProjectEmailConnection(projectId);
  if (!connection) return null;

  const token = await getValidToken(connection);

  const res = await fetch(
    `${GRAPH_BASE}/me/messages/${outlookMessageId}/attachments/${outlookAttachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.contentBytes) return null;

  return {
    content: Buffer.from(data.contentBytes, "base64"),
    contentType: data.contentType || "application/octet-stream",
    name: data.name || "attachment",
  };
}
