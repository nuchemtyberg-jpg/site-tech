import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getProxyUrl(url: string): string {
  if (!url) return url;
  
  if (url.startsWith("https://storage.googleapis.com/")) {
    const match = url.match(/\/uploads\/([a-f0-9-]+)(\?|$)/);
    if (match) {
      return `/objects/uploads/${match[1]}`;
    }
  }
  
  return url;
}
