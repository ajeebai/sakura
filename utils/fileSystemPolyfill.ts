import { BookMetadata, Page, FileHandle, DirectoryHandle } from '../types';
import { isImage, isPdf, naturalSort, determineCategory } from './fileUtils';
import { generateThumbnail } from './imageUtils';

// A lightweight wrapper to make standard File objects look like Handles
export class VirtualFileHandle {
  kind = 'file' as const;
  name: string;
  file: File; 

  constructor(file: File) {
    this.name = file.name;
    this.file = file;
  }

  async getFile() {
    return this.file;
  }
  
  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
}

export interface LegacyScanResult {
  libraryName: string;
  books: BookMetadata[];
  handles: { id: string; handle: any; coverHandle: any; pages?: Page[] }[];
}

export const processLegacyFileList = async (fileList: FileList): Promise<LegacyScanResult> => {
  const files = Array.from(fileList);
  if (files.length === 0) throw new Error("No files selected");

  // Group by directory
  const dirMap = new Map<string, File[]>();
  let rootName = "Imported Library";

  // Analyze paths to find the root folder name
  // webkitRelativePath example: "MyComics/Action/Batman/01.jpg"
  // We want to detect "MyComics" as the library name, and strip it from book paths.
  
  if (files.length > 0) {
      const parts = files[0].webkitRelativePath.split('/');
      if (parts.length > 0) rootName = parts[0];
  }
  
  files.forEach(file => {
    // Strip root folder from path
    const parts = file.webkitRelativePath.split('/');
    // If path is "Root/Book/Img.jpg", relative parts are ["Book", "Img.jpg"]
    // If path is "Root/Img.jpg", relative parts are ["Img.jpg"]
    const relativeParts = parts.slice(1);
    
    if (relativeParts.length > 0) {
      // Reconstruct path relative to library root
      // File at "Root/Category/Book/Img.jpg" -> "Category/Book"
      const parentPath = relativeParts.slice(0, -1).join('/');
      
      // If parentPath is empty, it's a file at root.
      // We generally group by parent folder.
      
      const key = parentPath; // Use empty string for root
      if (!dirMap.has(key)) {
        dirMap.set(key, []);
      }
      dirMap.get(key)?.push(file);
    }
  });

  const books: BookMetadata[] = [];
  const handles: { id: string; handle: any; coverHandle: any; pages?: Page[] }[] = [];
  const libraryId = crypto.randomUUID();

  for (const [dirPath, dirFiles] of dirMap.entries()) {
    const images = dirFiles.filter(f => isImage(f.name)).sort((a, b) => naturalSort(a.name, b.name));
    const pdfs = dirFiles.filter(f => isPdf(f.name));

    // Case 1: Image Folder Book
    if (images.length > 0) {
      const title = dirPath.split('/').pop() || rootName;
      const relativePath = dirPath; // Already relative to root
      const category = determineCategory(relativePath);
      const bookId = `${libraryId}|${relativePath}`;
      
      const coverFile = images[0];
      
      let coverBlob: Blob | undefined = undefined;
      try {
         coverBlob = await generateThumbnail(coverFile);
      } catch (e) { console.warn("Thumb failed", e); }

      const pages: Page[] = images.map(f => ({
          name: f.name,
          handle: new VirtualFileHandle(f) as unknown as FileHandle
      }));

      books.push({
        id: bookId,
        libraryId,
        title: title,
        path: relativePath,
        category: category,
        pageCount: images.length,
        format: 'image_folder',
        addedAt: Date.now(),
        coverImage: coverBlob,
        tags: []
      });

      handles.push({
        id: bookId,
        handle: { kind: 'directory', name: title }, 
        coverHandle: new VirtualFileHandle(coverFile),
        pages: pages 
      });
    }

    // Case 2: PDF Books
    for (const pdf of pdfs) {
       const title = pdf.name.replace(/\.pdf$/i, '');
       const relativePath = dirPath ? `${dirPath}/${pdf.name}` : pdf.name;
       const category = determineCategory(relativePath);
       const bookId = `${libraryId}|${relativePath}`;
       
       books.push({
         id: bookId,
         libraryId,
         title: title,
         path: relativePath,
         pageCount: 0, 
         format: 'pdf',
         addedAt: Date.now(),
         category: category,
         tags: []
       });

       handles.push({
           id: bookId,
           handle: new VirtualFileHandle(pdf),
           coverHandle: null
       });
    }
  }

  return {
    libraryName: rootName,
    books,
    handles
  };
};