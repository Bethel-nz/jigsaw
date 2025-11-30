import * as path from 'path';
import * as crypto from 'crypto';
import { mkdir, unlink } from 'fs/promises';

/**
 * Persistent cache for compiled templates using Bun's fast file APIs
 * Stores compiled template functions to disk for faster server restarts
 */
export class PersistentCache {
  private cacheDir: string;
  
  constructor(cacheDir: string = '.jigsaw-cache') {
    this.cacheDir = path.join(process.cwd(), cacheDir);
    this.ensureCacheDir();
  }
  
  /**
   * Ensure cache directory exists using Bun's API
   */
  private async ensureCacheDir(): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
    } catch (error: any) {
      // Directory might already exist, ignore EEXIST errors
      if (error.code !== 'EEXIST') {
        console.warn('[Cache] Failed to create cache directory:', error);
      }
    }
  }
  
  /**
   * Get cached compiled function using Bun.file()
   * @param key - Cache key (usually template content hash)
   * @returns Compiled function or null if not cached
   */
  async get(key: string): Promise<Function | null> {
    const cachePath = this.getCachePath(key);
    const file = Bun.file(cachePath);
    
    // Check if file exists
    const exists = await file.exists();
    if (!exists) {
      return null;
    }
    
    try {
      const code = await file.text();
      const factory = new Function('return ' + code);
      return factory();
    } catch (error) {
      // Cache corruption - invalidate
      await this.invalidate(key);
      return null;
    }
  }
  
  /**
   * Save compiled function to cache using Bun.write()
   * @param key - Cache key
   * @param code - Generated JavaScript code
   */
  async set(key: string, code: string): Promise<void> {
    const cachePath = this.getCachePath(key);
    
    try {
      await Bun.write(cachePath, code);
    } catch (error) {
      console.warn('[Cache] Failed to write cache:', error);
    }
  }
  
  /**
   * Invalidate cached entry
   * @param key - Cache key to invalidate
   */
  async invalidate(key: string): Promise<void> {
    const cachePath = this.getCachePath(key);
    
    try {
      await unlink(cachePath);
    } catch (error: any) {
      // Ignore if file doesn't exist
      if (error.code !== 'ENOENT') {
        console.warn('[Cache] Failed to delete cache file:', error);
      }
    }
  }
  
  /**
   * Clear all cache entries
   */
  async clearAll(): Promise<void> {
    const dir = Bun.file(this.cacheDir);
    const exists = await dir.exists();
    
    if (!exists) return;
    
    try {
      const glob = new Bun.Glob('*.js');
      const files = glob.scanSync(this.cacheDir);
      
      for (const file of files) {
        await unlink(path.join(this.cacheDir, file));
      }
    } catch (error) {
      console.warn('[Cache] Failed to clear cache:', error);
    }
  }
  
  /**
   * Get cache file path for a key
   * @param key - Cache key
   * @returns Absolute path to cache file
   */
  private getCachePath(key: string): string {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.cacheDir, `${hash}.js`);
  }
  
  /**
   * Get cache statistics using Bun's APIs
   * @returns Object with cache stats
   */
  async getStats(): Promise<{ size: number; files: number }> {
    const dir = Bun.file(this.cacheDir);
    const exists = await dir.exists();
    
    if (!exists) {
      return { size: 0, files: 0 };
    }
    
    try {
      const glob = new Bun.Glob('*.js');
      const files = Array.from(glob.scanSync(this.cacheDir));
      
      let totalSize = 0;
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const bunFile = Bun.file(filePath);
        totalSize += bunFile.size;
      }
      
      return { size: totalSize, files: files.length };
    } catch (error) {
      return { size: 0, files: 0 };
    }
  }
}
