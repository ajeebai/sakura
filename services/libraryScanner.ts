import { dbAddItem, getDB } from './db';
import { BookMetadata, Page, Book, DirectoryHandle } from '../types';

type ScanCallback = (message: string) => void;

// Singleton worker manager to reuse the worker thread
class ScannerWorkerManager {
  private worker: Worker | null = null;
  private pendingHydrations = new Map<string, { resolve: (p: Page[]) => void; reject: (e: any) => void }>();

  getWorker() {
    if (!this.worker) {
      this.worker = new Worker(new URL('./scanner.worker.ts', import.meta.url), { type: 'module' });
      
      this.worker.onmessage = async (e) => {
        const msg = e.data;

        if (msg.type === 'HYDRATE_RESULT') {
          const promise = this.pendingHydrations.get(msg.bookId);
          if (promise) {
            promise.resolve(msg.pages);
            this.pendingHydrations.delete(msg.bookId);
          }
        } else if (msg.type === 'ERROR') {
             // If it was a hydration error, find the context if possible, 
             // but simpler to just log for now as hydration maps by ID.
             console.error("Worker Error", msg);
        }
      };
    }
    return this.worker;
  }

  public hydrate(bookId: string, handle: DirectoryHandle): Promise<Page[]> {
    return new Promise((resolve, reject) => {
      this.pendingHydrations.set(bookId, { resolve, reject });
      this.getWorker().postMessage({ 
        type: 'HYDRATE_BOOK', 
        bookId, 
        handle 
      });
    });
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.pendingHydrations.clear();
    }
  }
}

export const workerManager = new ScannerWorkerManager();

export class LibraryScanner {
  private worker: Worker;
  
  constructor() {
    // We use a fresh worker for scanning to ensure isolation from hydration tasks if needed,
    // or we could reuse the manager. For robustness, a dedicated scan worker is safer 
    // to avoid message interleaving complexity during a long scan.
    this.worker = new Worker(new URL('./scanner.worker.ts', import.meta.url), { type: 'module' });
  }

  public async scan(
    libraryId: string, 
    rootHandle: FileSystemDirectoryHandle, 
    onProgress: ScanCallback
  ): Promise<void> {
    
    return new Promise((resolve, reject) => {
      this.worker.onmessage = async (e) => {
        const msg = e.data;

        switch (msg.type) {
          case 'PROGRESS':
            onProgress(msg.message);
            break;

          case 'FOUND_BOOK':
            await this.saveBook(msg.metadata, msg.handle, msg.coverHandle);
            break;

          case 'DONE':
            resolve();
            break;

          case 'ERROR':
            reject(new Error(msg.error));
            break;
        }
      };

      this.worker.onerror = (err) => {
        reject(err);
      };

      this.worker.postMessage({ type: 'START_SCAN', libraryId, rootHandle });
    });
  }

  private async saveBook(
    metadata: BookMetadata, 
    bookHandle: FileSystemHandle, 
    coverHandle: FileSystemFileHandle | null
  ) {
    const db = await getDB();
    const tx = db.transaction(['items', 'handles'], 'readwrite');
    
    await tx.objectStore('items').put(metadata);
    await tx.objectStore('handles').put({
      id: metadata.id,
      handle: bookHandle as any, 
      coverHandle: coverHandle
    });
    
    await tx.done;
  }

  public terminate() {
    this.worker.terminate();
  }
}
