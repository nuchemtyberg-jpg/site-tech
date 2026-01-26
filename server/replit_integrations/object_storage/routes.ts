import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

/**
 * Register object storage routes for file uploads.
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   */
  app.post("/api/uploads/request-url", async (req, res) => {
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
   */
  app.get("/objects/*", (req, res) => {
    // In express 4.x, the asterisk is captured in req.params[0]
    // We use req.params[0] which is standard for catch-all routes
    const objectPath = req.params[0];
    const fullPath = `/objects/${objectPath}`;
    
    objectStorageService.getObjectEntityFile(fullPath)
      .then(objectFile => objectStorageService.downloadObject(objectFile, res))
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
