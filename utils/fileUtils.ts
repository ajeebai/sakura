export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);
export const ARCHIVE_EXTENSIONS = new Set(['zip', 'cbz', 'cbr', 'rar']); // Note: CBR/RAR support is limited without heavy WASM

export const isImage = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
};

export const isPdf = (name: string) => {
   return name.toLowerCase().endsWith('.pdf');
};

export const isArchive = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ext ? ARCHIVE_EXTENSIONS.has(ext) : false;
};

export const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

// Helper to determine category from path
// e.g. "Manga/Naruto" -> "Manga"
// e.g. "BookAtRoot" -> undefined (Uncategorized)
export const determineCategory = (relativePath: string): string | undefined => {
    if (!relativePath) return undefined;
    
    const parts = relativePath.split('/');
    
    // We only categorize if it's nested (e.g. Category/BookName)
    // Direct children of the library root (length < 2) are "Uncategorized"
    if (parts.length < 2) return undefined; 
    
    const rawCategory = parts[0]; 

    // Format: "sci_fi-books" -> "Sci Fi Books"
    return rawCategory
      .replace(/[_-]/g, ' ')
      .replace(/\w\S*/g, (w) => (w.replace(/^\w/, (c) => c.toUpperCase())));
};