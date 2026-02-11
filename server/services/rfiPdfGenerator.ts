import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import fs from "fs";
import path from "path";
import { Rfi } from "@shared/schema";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";

function parseObjectPath(p: string): { bucketName: string; objectName: string } {
  if (!p.startsWith("/")) p = `/${p}`;
  const parts = p.split("/");
  return {
    bucketName: parts[1],
    objectName: parts.slice(2).join("/"),
  };
}

async function downloadFileBuffer(objectPath: string): Promise<Buffer> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  let fullPath: string;
  if (objectPath.startsWith("/objects/")) {
    const entityId = objectPath.slice("/objects/".length);
    fullPath = `${privateDir}/${entityId}`;
  } else {
    fullPath = objectPath;
  }
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [contents] = await file.download();
  return contents;
}

function isEmbeddableImage(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop() || "";
  return ["jpg", "jpeg", "png"].includes(ext);
}

interface RfiPdfOptions {
  rfi: Rfi;
  projectName: string;
  projectNumber?: string;
  attachmentFiles?: Array<{ name: string; path: string; contentType?: string }>;
}

export async function generateRfiPdf(options: RfiPdfOptions): Promise<Buffer> {
  const { rfi, projectName, projectNumber, attachmentFiles } = options;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = 612;
  const pageHeight = 792;
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  const { height } = page.getSize();
  let y = height;
  const margin = 45;
  const contentWidth = pageWidth - margin * 2;
  const rightEdge = pageWidth - margin;
  const lineHeight = 14;

  const brandNavy = rgb(0.12, 0.18, 0.28);
  const brandGold = rgb(0.82, 0.66, 0.2);
  const darkText = rgb(0.1, 0.1, 0.1);
  const mediumText = rgb(0.35, 0.35, 0.35);
  const lightText = rgb(0.55, 0.55, 0.55);
  const sectionBg = rgb(0.94, 0.95, 0.97);
  const tableBorder = rgb(0.82, 0.84, 0.88);

  const drawText = (text: string, x: number, yPos: number, size = 10, useBold = false, color = darkText) => {
    const safeText = (text || "").replace(/[\n\r\t]/g, " ");
    page.drawText(safeText, { x, y: yPos, size, font: useBold ? boldFont : font, color });
  };

  const wrapText = (text: string, maxWidth: number, fontSize: number, useFont: PDFFont = font): string[] => {
    const lines: string[] = [];
    const paragraphs = (text || "").split("\n");
    for (const para of paragraphs) {
      if (para.trim() === "") {
        lines.push("");
        continue;
      }
      const words = para.split(" ");
      let currentLine = "";
      for (const word of words) {
        const testLine = currentLine + (currentLine ? " " : "") + word;
        const w = useFont.widthOfTextAtSize(testLine, fontSize);
        if (w > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }
    return lines;
  };

  const footerMargin = 55;
  const addNewPageIfNeeded = (spaceNeeded = 80) => {
    if (y < footerMargin + spaceNeeded) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = height - 50;
    }
  };

  const drawSectionHeader = (title: string) => {
    addNewPageIfNeeded(60);
    page.drawRectangle({
      x: margin,
      y: y - 6,
      width: contentWidth,
      height: 22,
      color: brandNavy,
    });
    page.drawText(title, {
      x: margin + 10,
      y: y,
      size: 10,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    y -= 28;
  };

  const drawInfoRow = (label: string, value: string, x: number, labelWidth = 100) => {
    drawText(label, x, y, 9, true, mediumText);
    const wrappedValue = wrapText(value || "N/A", contentWidth - (x - margin) - labelWidth - 10, 9);
    for (let i = 0; i < wrappedValue.length; i++) {
      drawText(wrappedValue[i], x + labelWidth, y, 9, false, darkText);
      if (i < wrappedValue.length - 1) y -= lineHeight;
    }
    y -= lineHeight;
  };

  // === HEADER WITH LOGO (matching daily report style) ===
  let logoImage: any = null;
  try {
    const logoPaths = [
      path.resolve("attached_assets/Logo_1770600587313.png"),
      path.resolve("client/src/assets/sitetech-logo.png"),
      path.join(__dirname, "..", "attached_assets", "Logo_1770600587313.png"),
      path.join(__dirname, "..", "client", "src", "assets", "sitetech-logo.png"),
    ];
    for (const lp of logoPaths) {
      try {
        if (fs.existsSync(lp)) {
          const logoBytes = fs.readFileSync(lp);
          logoImage = await pdfDoc.embedPng(logoBytes);
          break;
        }
      } catch {
        continue;
      }
    }
  } catch {}

  page.drawRectangle({
    x: 0,
    y: height - 90,
    width: pageWidth,
    height: 90,
    color: brandNavy,
  });

  page.drawRectangle({
    x: 0,
    y: height - 94,
    width: pageWidth,
    height: 4,
    color: brandGold,
  });

  if (logoImage) {
    const logoMaxH = 55;
    const logoMaxW = 140;
    const logoScale = Math.min(logoMaxW / logoImage.width, logoMaxH / logoImage.height);
    const logoW = logoImage.width * logoScale;
    const logoH = logoImage.height * logoScale;
    page.drawImage(logoImage, {
      x: margin,
      y: height - 18 - logoH,
      width: logoW,
      height: logoH,
    });
  } else {
    page.drawText("SiteTech", {
      x: margin,
      y: height - 55,
      size: 24,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
  }

  page.drawText("REQUEST FOR INFORMATION", {
    x: rightEdge - boldFont.widthOfTextAtSize("REQUEST FOR INFORMATION", 18),
    y: height - 42,
    size: 18,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  const rfiLabel = `RFI-${String(rfi.rfiNumber).padStart(3, "0")}`;
  page.drawText(rfiLabel, {
    x: rightEdge - boldFont.widthOfTextAtSize(rfiLabel, 11),
    y: height - 58,
    size: 11,
    font: boldFont,
    color: brandGold,
  });

  y = height - 110;

  // === PROJECT & RFI INFO ===
  drawSectionHeader("RFI DETAILS");

  const col1 = margin + 12;
  const col2 = margin + contentWidth / 2 + 10;

  drawInfoRow("RFI Number:", rfiLabel, col1);
  y += lineHeight;
  drawInfoRow("Date:", rfi.createdAt ? new Date(rfi.createdAt).toLocaleDateString() : "N/A", col2);

  drawInfoRow("Project:", projectName, col1);
  if (projectNumber) {
    y += lineHeight;
    drawInfoRow("Project #:", projectNumber, col2);
  }

  drawInfoRow("Directed To:", rfi.directedTo || "N/A", col1);
  y += lineHeight;
  drawInfoRow("Email:", rfi.directedToEmail || "N/A", col2);

  drawInfoRow("Priority:", (rfi.priority || "normal").toUpperCase(), col1);
  if (rfi.dueDate) {
    y += lineHeight;
    drawInfoRow("Due Date:", new Date(rfi.dueDate).toLocaleDateString(), col2);
  }

  if (rfi.sentByName || rfi.sentByEmail) {
    drawInfoRow("Sent By:", `${rfi.sentByName || ""} ${rfi.sentByEmail ? `(${rfi.sentByEmail})` : ""}`.trim(), col1);
  }

  if (rfi.ccEmails && rfi.ccEmails.length > 0) {
    drawInfoRow("CC:", rfi.ccEmails.join(", "), col1);
  }

  y -= 8;

  // === SUBJECT ===
  drawSectionHeader("SUBJECT");
  const subjectLines = wrapText(rfi.subject, contentWidth - 24, 10);
  for (const line of subjectLines) {
    addNewPageIfNeeded();
    drawText(line, col1, y, 10, false, darkText);
    y -= lineHeight;
  }
  y -= 8;

  // === QUESTION ===
  drawSectionHeader("QUESTION / DESCRIPTION");
  const questionLines = wrapText(rfi.question, contentWidth - 24, 10);
  for (const line of questionLines) {
    addNewPageIfNeeded();
    drawText(line, col1, y, 10, false, darkText);
    y -= lineHeight;
  }
  y -= 8;

  // === ADDITIONAL DETAILS ===
  if (rfi.additionalBody) {
    drawSectionHeader("ADDITIONAL DETAILS");
    const bodyLines = wrapText(rfi.additionalBody, contentWidth - 24, 10);
    for (const line of bodyLines) {
      addNewPageIfNeeded();
      drawText(line, col1, y, 10, false, darkText);
      y -= lineHeight;
    }
    y -= 8;
  }

  // === ATTACHMENTS ===
  if (attachmentFiles && attachmentFiles.length > 0) {
    drawSectionHeader(`ATTACHMENTS (${attachmentFiles.length})`);

    for (const att of attachmentFiles) {
      try {
        if (isEmbeddableImage(att.name)) {
          const imageBuffer = await downloadFileBuffer(att.path);
          addNewPageIfNeeded(200);

          drawText(att.name, col1, y, 9, true, mediumText);
          y -= 16;

          try {
            let embeddedImage;
            const ext = att.name.toLowerCase().split(".").pop() || "";
            if (ext === "png") {
              embeddedImage = await pdfDoc.embedPng(imageBuffer);
            } else {
              embeddedImage = await pdfDoc.embedJpg(imageBuffer);
            }

            const maxW = contentWidth - 24;
            const maxH = 280;
            const scale = Math.min(maxW / embeddedImage.width, maxH / embeddedImage.height);
            const imgW = embeddedImage.width * scale;
            const imgH = embeddedImage.height * scale;

            if (y - imgH < 60) {
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              y = height - 50;
            }

            page.drawImage(embeddedImage, {
              x: col1,
              y: y - imgH,
              width: imgW,
              height: imgH,
            });
            y -= imgH + 15;
          } catch {
            page.drawText(`[Image could not be embedded: ${att.name}]`, {
              x: col1, y, size: 9, font: italicFont, color: lightText,
            });
            y -= lineHeight;
          }
        } else {
          addNewPageIfNeeded();
          page.drawRectangle({
            x: col1,
            y: y - 4,
            width: contentWidth - 24,
            height: 18,
            color: sectionBg,
          });
          drawText(`  ${att.name}`, col1, y, 9, false, mediumText);
          y -= 20;
        }
      } catch {
        addNewPageIfNeeded();
        page.drawText(`[Attachment unavailable: ${att.name}]`, {
          x: col1, y, size: 9, font: italicFont, color: lightText,
        });
        y -= lineHeight;
      }
    }
    y -= 8;
  }

  // === RESPONSE SECTION ===
  drawSectionHeader("RESPONSE");
  addNewPageIfNeeded(120);

  page.drawText("(Please respond to the email to provide your answer)", {
    x: col1, y, size: 9, font: italicFont, color: mediumText,
  });
  y -= 20;

  page.drawRectangle({
    x: margin,
    y: y - 80,
    width: contentWidth,
    height: 80,
    borderColor: tableBorder,
    borderWidth: 0.5,
  });
  y -= 90;

  // === FOOTER ON ALL PAGES ===
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const pg = pdfDoc.getPage(i);
    pg.drawLine({
      start: { x: margin, y: 38 },
      end: { x: pageWidth - margin, y: 38 },
      thickness: 0.5,
      color: tableBorder,
    });
    pg.drawText("SiteTech", { x: margin, y: 24, size: 8, font: boldFont, color: mediumText });
    pg.drawText(`Page ${i + 1} of ${totalPages}`, {
      x: pageWidth / 2 - font.widthOfTextAtSize(`Page ${i + 1} of ${totalPages}`, 8) / 2,
      y: 24, size: 8, font, color: lightText,
    });
    const rfiFooter = `${rfiLabel} | ${projectName}`;
    pg.drawText(rfiFooter, {
      x: pageWidth - margin - font.widthOfTextAtSize(rfiFooter, 7),
      y: 24, size: 7, font, color: lightText,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function uploadPdfToStorage(
  pdfBuffer: Buffer,
  projectId: number,
  rfiNumber: number
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  const objectPath = `${privateDir}/rfis/project-${projectId}/rfi-${rfiNumber}.pdf`;
  const { bucketName, objectName } = parseObjectPath(objectPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(pdfBuffer, { contentType: "application/pdf" });
  const entityId = objectPath.replace(privateDir + "/", "");
  return `/objects/${entityId}`;
}
