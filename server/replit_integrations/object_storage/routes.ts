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
}
