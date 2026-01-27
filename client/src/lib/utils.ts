import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function extractPhotoDate(file: File): Promise<string | null> {
  try {
    // Dynamic import with default export handling
    const exifreaderModule = await import("exifreader");
    const ExifReader = exifreaderModule.default || exifreaderModule;
    
    if (!ExifReader || typeof ExifReader.load !== 'function') {
      console.warn("ExifReader not properly loaded");
      return null;
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const tags = ExifReader.load(arrayBuffer, { expanded: true });
    
    // Try to get DateTimeOriginal (when photo was taken)
    const dateTimeOriginal = tags.exif?.DateTimeOriginal?.description;
    if (dateTimeOriginal) {
      // EXIF date format is "YYYY:MM:DD HH:MM:SS"
      const [datePart, timePart] = dateTimeOriginal.split(' ');
      const isoDate = datePart.replace(/:/g, '-') + 'T' + timePart;
      return new Date(isoDate).toISOString();
    }
    
    // Try DateTime as fallback
    const dateTime = tags.exif?.DateTime?.description;
    if (dateTime) {
      const [datePart, timePart] = dateTime.split(' ');
      const isoDate = datePart.replace(/:/g, '-') + 'T' + timePart;
      return new Date(isoDate).toISOString();
    }
    
    return null;
  } catch (error) {
    console.warn("EXIF extraction not available:", error);
    return null;
  }
}

export function getProxyUrl(url: string): string {
  if (!url) return url;
  
  // Already a proxy URL
  if (url.startsWith("/objects/")) {
    return url;
  }
  
  // Relative path like /uploads/uuid or /.private/uploads/uuid - convert to proxy format
  if (url.startsWith("/uploads/")) {
    return `/objects${url}`;
  }
  if (url.startsWith("/.private/uploads/")) {
    return url.replace("/.private/uploads/", "/objects/uploads/");
  }
  
  // Full GCS URL - extract the path and convert (handles both /uploads/ and /.private/uploads/)
  if (url.startsWith("https://storage.googleapis.com/")) {
    // Try .private/uploads first
    const privateMatch = url.match(/\/.private\/uploads\/([a-f0-9-]+)(\?|$)/);
    if (privateMatch) {
      return `/objects/uploads/${privateMatch[1]}`;
    }
    // Then try regular uploads
    const match = url.match(/\/uploads\/([a-f0-9-]+)(\?|$)/);
    if (match) {
      return `/objects/uploads/${match[1]}`;
    }
  }
  
  return url;
}
