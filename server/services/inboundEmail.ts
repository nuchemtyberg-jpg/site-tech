import { storage } from "../storage";
import { Client } from "@replit/object-storage";

const objectStorageClient = new Client();
const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR || "";

interface ParsedInboundEmail {
  from: string;
  to: string;
  cc?: string;
  subject?: string;
  text?: string;
  html?: string;
  envelope?: string;
  headers?: string;
  attachments?: number;
  "attachment-info"?: string;
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

function extractRecipientAddresses(to: string): string[] {
  return parseEmailList(to);
}

export async function processInboundEmail(
  body: ParsedInboundEmail,
  files: { fieldname: string; originalname: string; mimetype: string; size: number; buffer: Buffer }[]
) {
  const toAddresses = extractRecipientAddresses(body.to);
  const ccAddresses = parseEmailList(body.cc);
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

  const sender = parseEmailAddress(body.from);
  let envelopeData: any = {};
  try {
    if (body.envelope) envelopeData = JSON.parse(body.envelope);
  } catch {}

  const customer = matchedProject.customerId
    ? await storage.getCustomer(matchedProject.customerId)
    : null;
  const customerEmail = customer?.email?.toLowerCase();

  const isInternal = customerEmail
    ? !allRecipients.includes(customerEmail) && sender.email !== customerEmail
    : true;

  const messageId = `inbound-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  const email = await storage.createProjectEmail({
    projectId: matchedProject.id,
    source: "inbound",
    sendgridMessageId: messageId,
    outlookMessageId: null,
    conversationId: null,
    fromEmail: sender.email,
    fromName: sender.name || null,
    toEmails: toAddresses,
    ccEmails: ccAddresses.length > 0 ? ccAddresses : null,
    subject: body.subject || "(No Subject)",
    bodyPreview: body.text ? body.text.substring(0, 250) : null,
    bodyHtml: body.html || (body.text ? `<pre>${body.text}</pre>` : null),
    isInternal,
    hasAttachments: files.length > 0,
    receivedAt: new Date(),
  });

  if (files.length > 0) {
    let attachmentInfo: Record<string, any> = {};
    try {
      if (body["attachment-info"]) {
        attachmentInfo = JSON.parse(body["attachment-info"]);
      }
    } catch {}

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
