import PDFDocument from "pdfkit";
import { Rfi } from "@shared/schema";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
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

function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop() || "";
  return ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext);
}

interface RfiPdfOptions {
  rfi: Rfi;
  projectName: string;
  projectNumber?: string;
  attachmentFiles?: Array<{ name: string; path: string; contentType?: string }>;
}

export async function generateRfiPdf(options: RfiPdfOptions): Promise<Buffer> {
  const { rfi, projectName, projectNumber, attachmentFiles } = options;

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - 100;

      doc.rect(0, 0, doc.page.width, 90).fill("#1a365d");
      doc.fillColor("#ffffff").fontSize(24).font("Helvetica-Bold");
      doc.text("REQUEST FOR INFORMATION", 50, 25, { width: pageWidth, align: "center" });
      doc.fontSize(12).font("Helvetica");
      doc.text("SiteTech Construction Management", 50, 55, { width: pageWidth, align: "center" });

      let y = 110;

      doc.fillColor("#333333").fontSize(10).font("Helvetica-Bold");

      const drawInfoRow = (label: string, value: string, xPos: number, yPos: number, colWidth: number) => {
        doc.font("Helvetica-Bold").fillColor("#666666").fontSize(9);
        doc.text(label, xPos, yPos, { width: colWidth });
        doc.font("Helvetica").fillColor("#333333").fontSize(10);
        doc.text(value || "N/A", xPos, yPos + 12, { width: colWidth });
      };

      const col1 = 50;
      const col2 = 300;
      const colW = 230;

      drawInfoRow("RFI Number", `RFI-${String(rfi.rfiNumber).padStart(3, "0")}`, col1, y, colW);
      drawInfoRow("Date", rfi.createdAt ? new Date(rfi.createdAt).toLocaleDateString() : "N/A", col2, y, colW);
      y += 35;

      drawInfoRow("Project", projectName, col1, y, colW);
      if (projectNumber) {
        drawInfoRow("Project #", projectNumber, col2, y, colW);
      }
      y += 35;

      drawInfoRow("Directed To", `${rfi.directedTo} (${rfi.directedToEmail})`, col1, y, colW);
      drawInfoRow("Priority", (rfi.priority || "normal").toUpperCase(), col2, y, colW);
      y += 35;

      if (rfi.dueDate) {
        drawInfoRow("Due Date", new Date(rfi.dueDate).toLocaleDateString(), col1, y, colW);
        y += 35;
      }

      if (rfi.sentByName || rfi.sentByEmail) {
        drawInfoRow("Sent By", `${rfi.sentByName || ""} ${rfi.sentByEmail ? `(${rfi.sentByEmail})` : ""}`.trim(), col1, y, colW);
        y += 35;
      }

      if (rfi.ccEmails && rfi.ccEmails.length > 0) {
        drawInfoRow("CC", rfi.ccEmails.join(", "), col1, y, pageWidth);
        y += 35;
      }

      doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor("#dddddd").lineWidth(1).stroke();
      y += 15;

      doc.font("Helvetica-Bold").fillColor("#1a365d").fontSize(12);
      doc.text("Subject", 50, y);
      y += 18;
      doc.font("Helvetica").fillColor("#333333").fontSize(10);
      doc.text(rfi.subject, 50, y, { width: pageWidth });
      y = doc.y + 15;

      doc.font("Helvetica-Bold").fillColor("#1a365d").fontSize(12);
      doc.text("Question / Description", 50, y);
      y += 18;
      doc.font("Helvetica").fillColor("#333333").fontSize(10);
      doc.text(rfi.question, 50, y, { width: pageWidth, lineGap: 3 });
      y = doc.y + 15;

      if (rfi.additionalBody) {
        doc.font("Helvetica-Bold").fillColor("#1a365d").fontSize(12);
        doc.text("Additional Details", 50, y);
        y += 18;
        doc.font("Helvetica").fillColor("#333333").fontSize(10);
        doc.text(rfi.additionalBody, 50, y, { width: pageWidth, lineGap: 3 });
        y = doc.y + 15;
      }

      if (attachmentFiles && attachmentFiles.length > 0) {
        if (y > doc.page.height - 200) {
          doc.addPage();
          y = 50;
        }

        doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor("#dddddd").lineWidth(1).stroke();
        y += 15;

        doc.font("Helvetica-Bold").fillColor("#1a365d").fontSize(12);
        doc.text("Attachments", 50, y);
        y += 20;

        for (const att of attachmentFiles) {
          try {
            if (isImageFile(att.name)) {
              const imageBuffer = await downloadFileBuffer(att.path);

              if (y > doc.page.height - 300) {
                doc.addPage();
                y = 50;
              }

              doc.font("Helvetica").fillColor("#666666").fontSize(9);
              doc.text(att.name, 50, y);
              y += 14;

              try {
                const maxWidth = pageWidth;
                const maxHeight = 300;
                doc.image(imageBuffer, 50, y, { fit: [maxWidth, maxHeight] });
                const img = doc.openImage(imageBuffer);
                const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
                y += img.height * scale + 15;
              } catch (imgErr) {
                doc.font("Helvetica-Oblique").fillColor("#999999").fontSize(9);
                doc.text(`[Image could not be embedded: ${att.name}]`, 50, y);
                y += 15;
              }
            } else {
              doc.font("Helvetica").fillColor("#666666").fontSize(9);
              doc.text(`Attached: ${att.name}`, 60, y);
              y += 14;
            }
          } catch (err) {
            doc.font("Helvetica-Oblique").fillColor("#999999").fontSize(9);
            doc.text(`[Attachment unavailable: ${att.name}]`, 50, y);
            y += 14;
          }
        }
      }

      const responseY = Math.max(y + 20, doc.y + 20);
      if (responseY > doc.page.height - 200) {
        doc.addPage();
      }

      const boxY = responseY > doc.page.height - 200 ? 50 : responseY;
      doc.moveTo(50, boxY).lineTo(50 + pageWidth, boxY).strokeColor("#dddddd").lineWidth(1).stroke();

      doc.font("Helvetica-Bold").fillColor("#1a365d").fontSize(12);
      doc.text("Response", 50, boxY + 10);
      doc.font("Helvetica").fillColor("#999999").fontSize(10);
      doc.text("(Please respond to the email to provide your answer)", 50, boxY + 25, { width: pageWidth });

      doc.rect(50, boxY + 45, pageWidth, 100).strokeColor("#cccccc").lineWidth(0.5).stroke();

      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.font("Helvetica").fillColor("#999999").fontSize(8);
        doc.text(
          `Page ${i + 1} of ${totalPages} | RFI-${String(rfi.rfiNumber).padStart(3, "0")} | ${projectName}`,
          50,
          doc.page.height - 35,
          { width: pageWidth, align: "center" }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
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
