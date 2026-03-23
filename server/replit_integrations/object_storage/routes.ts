import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { isAuthenticated } from "../auth";
import { isAuthorizedUser } from "../../middleware/auth";

/**
 * Register object storage routes for file uploads.
 * All routes are protected by authentication and authorization middleware.
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   * Protected: Only authenticated and authorized users can request upload URLs.
   */
  app.post("/api/uploads/request-url", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Serve uploaded objects.
   * Matches /objects/uploads/:id
   * Protected: Only authenticated and authorized users can access uploaded files.
   */
  app.get("/objects/uploads/:id", isAuthenticated, isAuthorizedUser, (req, res) => {
    const fullPath = `/objects/uploads/${req.params.id}`;
    const filename = req.query.filename as string | undefined;
    const download = req.query.download === 'true';
    
    objectStorageService.getObjectEntityFile(fullPath)
      .then(objectFile => objectStorageService.downloadObject(objectFile, res, 3600, filename, download))
      .catch(error => {
        console.error("Error serving object:", error);
        if (error instanceof ObjectNotFoundError) {
          res.status(404).json({ error: "Object not found" });
        } else {
          res.status(500).json({ error: "Failed to serve object" });
        }
      });
  });

  app.get("/api/proxy-file", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const url = req.query.url as string;
      const filename = req.query.filename as string | undefined;
      const download = req.query.download === 'true';

      if (!url || (!url.startsWith("https://res.cloudinary.com/") && !url.startsWith("https://storage.googleapis.com/"))) {
        return res.status(400).json({ error: "Invalid or disallowed URL" });
      }

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch file" });
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      };
      if (filename) {
        const sanitized = filename.replace(/[^\w\s\-\.()]/g, '_');
        const disposition = download ? 'attachment' : 'inline';
        headers["Content-Disposition"] = `${disposition}; filename="${sanitized}"`;
      }
      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        headers["Content-Length"] = contentLength;
      }
      res.set(headers);

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error("Error proxying file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to proxy file" });
      }
    }
  });
}
