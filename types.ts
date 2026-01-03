

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
  readCount?: number; // Used for Digital Patina
  
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

export interface Playlist {
    id: string;
    name: string;
    bookIds: string[];
    createdAt: number;
}

// --- Runtime Types (App State) ---

export interface Page {
  name: string;
  handle: FileHandle;
}

// A Book at runtime includes the handles needed to read it
export interface Book extends BookMetadata {
  coverHandle: FileHandle | null;
  pages: Page[]; 
  handle: DirectoryHandle | FileHandle; 
  readingProgress?: ReadingProgress;
}

// --- View State ---

export type ViewState = 'WELCOME' | 'LIBRARY_LIST' | 'LIBRARY' | 'READER';

export type Theme = 'sakura-night' | 'ivory-paper' | 'ink-blossom' | 'cyber-grid' | 'autumn-scroll' | 'nordic-frost';

// Added 'infinity' mode
export type LibraryViewMode = 'category' | 'grid' | 'infinity';
export type SortOption = 'title' | 'added' | 'recent';

export interface AppState {
  view: ViewState;
  libraries: Library[];
  libraryBooks: Book[]; 
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
    viewMode: 'single' | 'vertical' | 'spread'; // Added 'spread'
    slideshowInterval: number; // seconds
    smartSplit: boolean; 
    
    // Visual/Audio Settings
    enableSfx: boolean;
    atmosphere: 'none' | 'rain' | 'vinyl';
    lightingMode: 'ambient' | 'spotlight';
    textureMode: 'none' | 'grain' | 'halftone' | 'fabric';
    transitionMode: 'none' | 'slide' | 'flip' | 'datamosh';
}

// --- Menu Types ---
export type MenuContextType = 'GLOBAL' | 'BOOK' | 'READER';

export interface MenuContext {
    type: MenuContextType;
    x: number;
    y: number;
    data?: any; // Book object, etc.
}