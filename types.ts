// --- File System Types ---
export interface FileHandle extends FileSystemFileHandle {
  readonly kind: 'file';
}

export interface DirectoryHandle extends FileSystemDirectoryHandle {
  readonly kind: 'directory';
}

export interface FileSystemHandlePermissionDescriptor {
  mode: 'read' | 'readwrite';
}

// --- Persisted Database Types (IndexedDB) ---

export interface Library {
  id: string;        // UUID
  name: string;      // Folder name or user alias
  handle: DirectoryHandle; // Root handle
  addedAt: number;
  theme?: string;    // Per-library theme override
}

export interface BookMetadata {
  id: string;        // Unique ID (libraryId + relative path hash, or UUID)
  libraryId?: string;// Reference to parent Library
  
  title: string;
  path: string;      // Relative path from Library Root
  category?: string; // Derived from folder structure (e.g. "Action", "Docs")
  
  pageCount: number;
  format?: 'image_folder' | 'pdf' | 'archive'; 
  
  // Organization
  tags?: string[];
  isFavorite?: boolean;
  isHidden?: boolean;
  
  // Timestamps
  addedAt: number;
  lastReadAt?: number;
  
  // Visuals
  coverImage?: Blob; // Cached optimized thumbnail
}

export interface ReadingProgress {
  bookId: string;
  libraryId?: string;
  
  currentPageIndex: number; // 0-based index
  totalPages: number;
  
  percentage: number; // 0-100
  status: 'unread' | 'in_progress' | 'completed';
  
  lastReadAt: number;
}

export interface Bookmark {
    id: string; // bookId + pageIndex
    bookId: string;
    pageIndex: number;
    createdAt: number;
}

// --- Runtime Types (App State) ---

export interface Page {
  name: string;
  handle: FileHandle;
}

// A Book at runtime includes the handles needed to read it
// It extends Metadata so we can pass it around easily
export interface Book extends BookMetadata {
  // Runtime handles (not persisted in 'items' store, but maybe in 'handles' store)
  coverHandle: FileHandle | null;
  pages: Page[]; 
  handle: DirectoryHandle | FileHandle; // Supports both Folders and PDF Files
  readingProgress?: ReadingProgress;
}

// --- View State ---

export type ViewState = 'WELCOME' | 'LIBRARY_LIST' | 'LIBRARY' | 'READER';

export type Theme = 'sakura-night' | 'ivory-paper' | 'ink-blossom';

export type LibraryViewMode = 'category' | 'grid';
export type SortOption = 'title' | 'added' | 'recent';

export interface AppState {
  view: ViewState;
  libraries: Library[];
  libraryBooks: Book[]; // Books for the active library
  activeLibraryId: string | null;
  activeBookId: string | null;
  loading: boolean;
  loadingMessage: string;
  isDbReady: boolean;
  theme: Theme;
}

export type ReadingDirection = 'LTR' | 'RTL';
export type ImageFitMode = 'contain' | 'width' | 'height' | 'original';

export interface ReaderSettings {
    direction: ReadingDirection;
    fitMode: ImageFitMode;
    viewMode: 'single' | 'vertical';
    slideshowInterval: number; // seconds
    zenMode: boolean; // Ambient background
    smartSplit: boolean; // Split landscape images in two (for single view)
}