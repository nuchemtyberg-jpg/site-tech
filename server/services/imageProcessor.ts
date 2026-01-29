import sharp from "sharp";
import { encode } from "blurhash";
import { objectStorageClient } from "../replit_integrations/object_storage";
import { randomUUID } from "crypto";

interface ProcessedImage {
  thumbnailPath: string;
  mediumPath: string;
  blurHash: string;
  width: number;
  height: number;
}

interface ImageDimensions {
  width: number;
  height: number;
}

const THUMBNAIL_SIZE = 150;
const MEDIUM_SIZE = 600;
const BLURHASH_COMPONENT_X = 4;
const BLURHASH_COMPONENT_Y = 3;

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return { bucketName, objectName };
}

export async function processImage(objectPath: string): Promise<ProcessedImage | null> {
  try {
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!privateObjectDir) {
      console.warn("PRIVATE_OBJECT_DIR not set, skipping image processing");
      return null;
    }

    let fullPath: string;
    if (objectPath.startsWith("/objects/")) {
      const entityId = objectPath.slice("/objects/".length);
      fullPath = `${privateObjectDir}/${entityId}`;
    } else {
      fullPath = objectPath;
    }

    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    const [exists] = await file.exists();
    if (!exists) {
      console.error("Original file not found:", fullPath);
      return null;
    }

    const [fileBuffer] = await file.download();
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      console.error("Could not get image dimensions");
      return null;
    }

    const [thumbnailBuffer, mediumBuffer, blurHashData] = await Promise.all([
      generateThumbnail(fileBuffer, THUMBNAIL_SIZE),
      generateThumbnail(fileBuffer, MEDIUM_SIZE),
      generateBlurHash(fileBuffer),
    ]);

    const thumbnailId = `thumbnails/${randomUUID()}.webp`;
    const mediumId = `medium/${randomUUID()}.webp`;

    const thumbnailPath = `${privateObjectDir}/${thumbnailId}`;
    const mediumPath = `${privateObjectDir}/${mediumId}`;

    const { bucketName: thumbBucket, objectName: thumbObject } = parseObjectPath(thumbnailPath);
    const { bucketName: medBucket, objectName: medObject } = parseObjectPath(mediumPath);

    await Promise.all([
      objectStorageClient
        .bucket(thumbBucket)
        .file(thumbObject)
        .save(thumbnailBuffer, { contentType: "image/webp" }),
      objectStorageClient
        .bucket(medBucket)
        .file(medObject)
        .save(mediumBuffer, { contentType: "image/webp" }),
    ]);

    return {
      thumbnailPath: `/objects/${thumbnailId}`,
      mediumPath: `/objects/${mediumId}`,
      blurHash: blurHashData,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    console.error("Error processing image:", error);
    return null;
  }
}

async function generateThumbnail(buffer: Buffer, size: number): Promise<Buffer> {
  return sharp(buffer)
    .resize(size, size, {
      fit: "cover",
      position: "center",
    })
    .webp({ quality: 80 })
    .toBuffer();
}

async function generateBlurHash(buffer: Buffer): Promise<string> {
  try {
    const { data, info } = await sharp(buffer)
      .raw()
      .ensureAlpha()
      .resize(32, 32, { fit: "inside" })
      .toBuffer({ resolveWithObject: true });

    return encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      BLURHASH_COMPONENT_X,
      BLURHASH_COMPONENT_Y
    );
  } catch (error) {
    console.error("Error generating blurhash:", error);
    return "LEHV6nWB2yk8pyo0adR*.7kCMdnj";
  }
}

export async function getImageDimensions(buffer: Buffer): Promise<ImageDimensions | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
    return null;
  } catch {
    return null;
  }
}
