import { storage } from "../storage";
import { Client } from "@replit/object-storage";
import crypto from "crypto";

const objectStorageClient = new Client();
const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR || "";

interface MailgunInboundEmail {
  recipient: string;
  sender: string;
  from: string;
  subject?: string;
  "body-plain"?: string;
  "body-html"?: string;
  "stripped-text"?: string;
  "stripped-html"?: string;
  To?: string;
  Cc?: string;
  "Message-Id"?: string;
  "message-headers"?: string;
  "attachment-count"?: string;
  timestamp?: string;
  token?: string;
  signature?: string;
}

export function verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
  const apiKey = process.env.MAILGUN_API_KEY;
  if (!apiKey) {
    return false;
  }

  const data = timestamp + token;
  const hash = crypto.createHmac("sha256", apiKey).update(data).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

function parseEmailAddress(raw: string): { email: string; name?: string } {
  const withAngle = raw.match(/<([^<>]+@[^<>]+)>/);
  if (withAngle) {
    const namePart = raw.substring(0, raw.indexOf("<")).trim().replace(/^"(.*)"$/, "$1");
    return { name: namePart || undefined, email: withAngle[1].toLowerCase().trim() };
  }
  const emailOnly = raw.trim();
  if (emailOnly.includes("@")) {
    return { email: emailOnly.toLowerCase() };
  }
  return { email: raw.trim().toLowerCase() };
}

function parseEmailList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map(e => {
    const parsed = parseEmailAddress(e.trim());
    return parsed.email;
  }).filter(Boolean);
}

export async function processInboundEmail(
  body: MailgunInboundEmail,
  files: { fieldname: string; originalname: string; mimetype: string; size: number; buffer: Buffer }[]
) {
  const toAddresses = parseEmailList(body.recipient || body.To);
  const ccAddresses = parseEmailList(body.Cc);
  const allRecipients = [...toAddresses, ...ccAddresses];

  let matchedProject = null;
  let matchedAddress = "";

  for (const addr of allRecipients) {
    const project = await storage.getProjectByEmail(addr);
    if (project) {
      matchedProject = project;
      matchedAddress = addr;
      break;
    }
  }

  if (!matchedProject) {
    console.log(`Inbound email: no matching project for recipients: ${allRecipients.join(", ")}`);
    return { processed: false, reason: "No matching project found" };
  }

  const sender = parseEmailAddress(body.from || body.sender);

  const customer = matchedProject.customerId
    ? await storage.getCustomer(matchedProject.customerId)
    : null;
  const customerEmail = customer?.email?.toLowerCase();

  const isInternal = customerEmail
    ? !allRecipients.includes(customerEmail) && sender.email !== customerEmail
    : true;

  const messageId = body["Message-Id"] || `inbound-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  const bodyHtml = body["body-html"] || body["stripped-html"];
  const bodyPlain = body["body-plain"] || body["stripped-text"];

  const email = await storage.createProjectEmail({
    projectId: matchedProject.id,
    source: "inbound",
    inboundMessageId: messageId,
    outlookMessageId: null,
    conversationId: null,
    fromEmail: sender.email,
    fromName: sender.name || null,
    toEmails: toAddresses,
    ccEmails: ccAddresses.length > 0 ? ccAddresses : null,
    subject: body.subject || "(No Subject)",
    bodyPreview: bodyPlain ? bodyPlain.substring(0, 250) : null,
    bodyHtml: bodyHtml || (bodyPlain ? `<pre>${bodyPlain}</pre>` : null),
    isInternal,
    hasAttachments: files.length > 0,
    receivedAt: new Date(),
  });

  if (files.length > 0) {
    for (const file of files) {
      const storagePath = `${PRIVATE_DIR}/email-attachments/${matchedProject.id}/${email.id}/${file.originalname}`;

      try {
        await objectStorageClient.uploadFromBytes(storagePath, file.buffer);
      } catch (err) {
        console.error(`Failed to store attachment ${file.originalname}:`, err);
      }

      await storage.createProjectEmailAttachment({
        emailId: email.id,
        outlookAttachmentId: null,
        storagePath,
        name: file.originalname,
        contentType: file.mimetype,
        size: file.size,
      });
    }
  }

  console.log(`Inbound email processed: "${body.subject}" from ${sender.email} -> project ${matchedProject.id} (${matchedProject.name})`);
  return { processed: true, projectId: matchedProject.id, emailId: email.id };
}
