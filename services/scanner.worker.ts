/// <reference lib="webworker" />
import { isImage, isPdf, isArchive, naturalSort, determineCategory } from '../utils/fileUtils';
import { BookMetadata, Page, FileHandle } from '../types';

/* 
  Scanner Worker
  - Runs off-main-thread.
  - Recursively traverses directories.
  - Identifies 'Books' based on content (Image Folder vs PDF vs Archive).
  - Sends found items back to main thread for DB insertion.
  - Hydrates books (lists pages) to keep main thread responsive.
*/

type ScanMessage = 
  | { type: 'START_SCAN'; libraryId: string; rootHandle: FileSystemDirectoryHandle }
  | { type: 'HYDRATE_BOOK'; bookId: string; handle: FileSystemDirectoryHandle };

self.onmessage = async (e: MessageEvent<ScanMessage>) => {
  const msg = e.data;

  try {
    if (msg.type === 'START_SCAN') {
      const { libraryId, rootHandle } = msg;
      // Start scanning. Root path is empty string.
      await scanDirectory(rootHandle, '', libraryId);
      self.postMessage({ type: 'DONE', libraryId });
    } 
    else if (msg.type === 'HYDRATE_BOOK') {
      const { bookId, handle } = msg;
      await hydrateBook(bookId, handle);
    }
  } catch (err: any) {
    console.error("Worker Error:", err);
    self.postMessage({ 
      type: 'ERROR', 
      error: err.message || 'Unknown worker error',
      context: msg.type
    });
  }
};

async function hydrateBook(bookId: string, dirHandle: FileSystemDirectoryHandle) {
  const pages: Page[] = [];
  
  // 1. Iterate
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && isImage(entry.name)) {
      pages.push({
        name: entry.name,
        handle: entry as FileHandle
      });
    }
  }

  // 2. Sort
  pages.sort((a, b) => naturalSort(a.name, b.name));

  // 3. Return
  self.postMessage({
    type: 'HYDRATE_RESULT',
    bookId,
    pages
  });
}

async function scanDirectory(dirHandle: FileSystemDirectoryHandle, path: string, libraryId: string) {
  const entries: { handle: FileSystemHandle; name: string }[] = [];
  
  for await (const entry of dirHandle.values()) {
    entries.push({ handle: entry, name: entry.name });
  }

  const images: FileSystemFileHandle[] = [];
  const pdfs: FileSystemFileHandle[] = [];
  const archives: FileSystemFileHandle[] = [];
  const subDirs: FileSystemDirectoryHandle[] = [];

  for (const entry of entries) {
    if (entry.handle.kind === 'file') {
      if (isImage(entry.name)) {
        images.push(entry.handle as FileSystemFileHandle);
      } else if (isPdf(entry.name)) {
        pdfs.push(entry.handle as FileSystemFileHandle);
      } else if (isArchive(entry.name)) {
        archives.push(entry.handle as FileSystemFileHandle);
      }
    } else if (entry.handle.kind === 'directory') {
      subDirs.push(entry.handle as FileSystemDirectoryHandle);
    }
  }

  // --- Case 1: Image Folder Book ---
  // A folder is a book if it contains images directly
  if (images.length > 0) {
    const sortedNames = images.map(h => h.name).sort(naturalSort);
    const coverName = sortedNames[0];
    const coverHandle = images.find(h => h.name === coverName);

    // If path is empty (Root), relativePath is just name.
    // If path is "Action", relativePath is "Action/Batman"
    // Wait, 'path' passed to scanDirectory IS the path of dirHandle relative to root.
    // Ideally we'd just use 'path', but if we are at root, 'path' is empty. 
    // We want the book path to be useful.
    
    // Actually, if 'path' is passed correctly by the recursion loop below, 
    // 'path' IS the relative path of THIS directory.
    // Except for Root, where path is empty.
    
    // If path is empty, we use dirHandle.name? No, if we mounted "MyComics", we treat that as root.
    // Books inside root have path "". 
    // But we need a unique ID.
    const relativePath = path || dirHandle.name; 

    // Category Determination
    const category = determineCategory(path); 

    const bookId = `${libraryId}|${relativePath}`;
    
    const metadata: BookMetadata = {
      id: bookId,
      libraryId,
      title: dirHandle.name.replace(/[_-]/g, ' '),
      path: relativePath,
      category: category,
      pageCount: images.length,
      format: 'image_folder',
      addedAt: Date.now(),
    };

    self.postMessage({
      type: 'FOUND_BOOK',
      metadata,
      handle: dirHandle,
      coverHandle: coverHandle
    });
  }

  // --- Case 2: PDF Books ---
  for (const pdf of pdfs) {
     const relativePath = path ? `${path}/${pdf.name}` : pdf.name;
     const category = determineCategory(relativePath); // Use file path to determine category

     const bookId = `${libraryId}|${relativePath}`;
     
     const metadata: BookMetadata = {
      id: bookId,
      libraryId,
      title: pdf.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' '),
      path: relativePath,
      category: category,
      pageCount: 0,
      format: 'pdf',
      addedAt: Date.now(),
    };

    self.postMessage({
      type: 'FOUND_BOOK',
      metadata,
      handle: pdf, 
      coverHandle: null 
    });
  }

  // --- Case 3: Archive Books (CBZ/ZIP) ---
  for (const archive of archives) {
     const relativePath = path ? `${path}/${archive.name}` : archive.name;
     const category = determineCategory(relativePath);
     const bookId = `${libraryId}|${relativePath}`;
     
     const metadata: BookMetadata = {
      id: bookId,
      libraryId,
      title: archive.name.replace(/\.(zip|cbz|cbr|rar)$/i, '').replace(/[_-]/g, ' '),
      path: relativePath,
      category: category,
      pageCount: 0,
      format: 'archive',
      addedAt: Date.now(),
    };

    self.postMessage({
      type: 'FOUND_BOOK',
      metadata,
      handle: archive, 
      coverHandle: null 
    });
  }

  // --- Recurse ---
  for (const subDir of subDirs) {
    // Correct Path Logic:
    // Append the CHILD name to the CURRENT path.
    // If current path is empty (Root), child path is "ChildName".
    // If current path is "Action", child path is "Action/ChildName".
    const nextPath = path ? `${path}/${subDir.name}` : subDir.name;
    
    self.postMessage({ type: 'PROGRESS', message: `Scanning ${nextPath}...` });
    await scanDirectory(subDir, nextPath, libraryId);
  }
}