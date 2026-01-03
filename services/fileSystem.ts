import { FileHandle, Book, Page, FileSystemHandlePermissionDescriptor, DirectoryHandle } from '../types';
import { workerManager } from './libraryScanner';
import JSZip from 'jszip';
import { isImage, naturalSort } from '../utils/fileUtils';

export const getFileUrl = async (handle: FileHandle): Promise<string> => {
  const file = await handle.getFile();
  return URL.createObjectURL(file);
};

// Hydrates a book by scanning its directory for pages using a Worker
export const hydrateBook = async (book: Book): Promise<Book> => {
  if (book.pages.length > 0 || !book.handle) return book;
  
  let pages: Page[] = [];
  
  // 1. Image Folder
  if (book.format === 'image_folder' && book.handle.kind === 'directory') {
    try {
        pages = await workerManager.hydrate(book.id, book.handle as DirectoryHandle);
    } catch (e) {
        console.error("Worker hydration failed", e);
        throw e;
    }
  } 
  
  // 2. Archives (ZIP/CBZ)
  else if (book.format === 'archive' && book.handle.kind === 'file') {
      try {
          const file = await (book.handle as any).getFile();
          
          // Basic ZIP/CBZ support
          if (file.name.endsWith('.zip') || file.name.endsWith('.cbz')) {
              const zip = await JSZip.loadAsync(file);
              const entries: { name: string, obj: any }[] = [];
              
              zip.forEach((relativePath, zipEntry) => {
                  if (!zipEntry.dir && isImage(zipEntry.name) && !zipEntry.name.startsWith('__MACOSX')) {
                      entries.push({ name: zipEntry.name.split('/').pop() || zipEntry.name, obj: zipEntry });
                  }
              });
              
              entries.sort((a, b) => naturalSort(a.name, b.name));
              
              pages = entries.map(entry => {
                  // Create a "Virtual Handle" that generates the blob on demand
                  // This is a bit of a hack to fit the FileHandle interface
                  const virtualHandle = {
                      kind: 'file' as const,
                      name: entry.name,
                      getFile: async () => {
                          const blob = await entry.obj.async('blob');
                          return new File([blob], entry.name, { type: 'image/jpeg' });
                      },
                      queryPermission: async () => 'granted',
                      requestPermission: async () => 'granted'
                  };
                  
                  return {
                      name: entry.name,
                      handle: virtualHandle as any // Cast to FileHandle
                  };
              });
          } else {
              console.warn("Unsupported archive format (only ZIP/CBZ supported currently)", file.name);
          }
      } catch (e) {
          console.error("Archive hydration failed", e);
      }
  }
  
  return { ...book, pages };
};

// Check if we have permission, request if 'prompt', return false if denied
export const verifyPermission = async (handle: FileSystemHandle, readWrite = false): Promise<boolean> => {
  const options: FileSystemHandlePermissionDescriptor = {
    mode: readWrite ? 'readwrite' : 'read'
  };

  try {
      // Check current state
      if ((await (handle as any).queryPermission(options)) === 'granted') {
        return true;
      }

      // Request permission
      if ((await (handle as any).requestPermission(options)) === 'granted') {
        return true;
      }
  } catch (e) {
      console.warn("Permission verification failed:", e);
      return false;
  }

  return false;
};