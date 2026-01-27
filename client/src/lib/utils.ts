import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
