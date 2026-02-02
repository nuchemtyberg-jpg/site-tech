import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface ImageCacheDB extends DBSchema {
  thumbnails: {
    key: string;
    value: {
      url: string;
      blob: Blob;
      timestamp: number;
      size: number;
    };
  };
}

const DB_NAME = 'photo-library-cache';
const DB_VERSION = 1;
const CACHE_MAX_SIZE = 100 * 1024 * 1024;
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let dbInstance: IDBPDatabase<ImageCacheDB> | null = null;
const memoryCache = new Map<string, string>();
const MAX_MEMORY_CACHE_SIZE = 200;

async function getDB(): Promise<IDBPDatabase<ImageCacheDB> | null> {
  if (dbInstance) return dbInstance;
  
  try {
    dbInstance = await openDB<ImageCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('thumbnails')) {
          db.createObjectStore('thumbnails', { keyPath: 'url' });
        }
      },
    });
    return dbInstance;
  } catch (error) {
    console.warn('IndexedDB not available, using memory cache only');
    return null;
  }
}

export async function getCachedImage(url: string): Promise<string | null> {
  if (memoryCache.has(url)) {
    return memoryCache.get(url)!;
  }

  try {
    const db = await getDB();
    if (!db) return null;

    const cached = await db.get('thumbnails', url);
    if (cached) {
      if (Date.now() - cached.timestamp > CACHE_MAX_AGE) {
        await db.delete('thumbnails', url);
        return null;
      }
      
      const objectUrl = URL.createObjectURL(cached.blob);
      addToMemoryCache(url, objectUrl);
      return objectUrl;
    }
  } catch (error) {
    console.warn('Error reading from cache:', error);
  }
  
  return null;
}

export async function cacheImage(url: string, blob: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(blob);
  addToMemoryCache(url, objectUrl);

  try {
    const db = await getDB();
    if (db) {
      await db.put('thumbnails', {
        url,
        blob,
        timestamp: Date.now(),
        size: blob.size,
      });
      
      await cleanupOldCache(db);
    }
  } catch (error) {
    console.warn('Error writing to cache:', error);
  }

  return objectUrl;
}

function addToMemoryCache(url: string, objectUrl: string) {
  if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) {
      memoryCache.delete(firstKey);
    }
  }
  memoryCache.set(url, objectUrl);
}

async function cleanupOldCache(db: IDBPDatabase<ImageCacheDB>) {
  try {
    const allKeys = await db.getAllKeys('thumbnails');
    const allItems = await Promise.all(
      allKeys.map(async (key) => {
        const item = await db.get('thumbnails', key);
        return item ? { key, ...item } : null;
      })
    );

    const validItems = allItems.filter(Boolean) as Array<{
      key: string;
      timestamp: number;
      size: number;
    }>;

    let totalSize = validItems.reduce((sum, item) => sum + item.size, 0);
    const now = Date.now();

    for (const item of validItems) {
      if (now - item.timestamp > CACHE_MAX_AGE) {
        await db.delete('thumbnails', item.key);
        totalSize -= item.size;
      }
    }

    if (totalSize > CACHE_MAX_SIZE) {
      const sortedByAge = validItems
        .filter(item => now - item.timestamp <= CACHE_MAX_AGE)
        .sort((a, b) => a.timestamp - b.timestamp);

      for (const item of sortedByAge) {
        if (totalSize <= CACHE_MAX_SIZE * 0.8) break;
        await db.delete('thumbnails', item.key);
        totalSize -= item.size;
      }
    }
  } catch (error) {
    console.warn('Error cleaning up cache:', error);
  }
}

export async function prefetchImages(urls: string[]): Promise<void> {
  const uncachedUrls = await Promise.all(
    urls.map(async (url) => {
      const cached = await getCachedImage(url);
      return cached ? null : url;
    })
  );

  const urlsToFetch = uncachedUrls.filter(Boolean) as string[];

  await Promise.all(
    urlsToFetch.slice(0, 5).map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const blob = await response.blob();
          await cacheImage(url, blob);
        }
      } catch {}
    })
  );
}

export function clearMemoryCache() {
  memoryCache.clear();
}
