
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Book, BookMetadata, Library, ReadingProgress, FileHandle, Page, ReaderSettings, Bookmark, Playlist } from '../types';

interface SakuraDB extends DBSchema {
  libraries: {
    key: string;
    value: Library;
  };
  items: {
    key: string; // bookId
    value: BookMetadata;
    indexes: { 
      'by-library': string;
      'by-title': string;
      'by-added': number;
      'by-last-read': number;
      'is-favorite': number; 
    };
  };
  handles: {
    key: string; // bookId
    value: { 
        id: string; 
        handle: FileSystemDirectoryHandle | FileSystemFileHandle | any; 
        coverHandle?: FileSystemFileHandle | any | null;
        pages?: Page[]; // OPTIONAL: Cached pages for legacy/firefox support
    };
  };
  progress: {
    key: string; // bookId
    value: ReadingProgress;
    indexes: {
      'by-last-read': number;
    }
  };
  bookmarks: {
      key: string; // id
      value: Bookmark;
      indexes: { 'by-book': string };
  };
  playlists: {
      key: string;
      value: Playlist;
  };
  settings: {
    key: string;
    value: { key: string; value: any };
  };
}

const DB_NAME = 'sakura-db';
const DB_VERSION = 4; // Incremented for Playlists

let dbPromise: Promise<IDBPDatabase<SakuraDB>> | null = null;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<SakuraDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        
        // 1. Libraries Store
        if (!db.objectStoreNames.contains('libraries')) {
          db.createObjectStore('libraries', { keyPath: 'id' });
        }

        // 2. Items (Books) Store
        let itemStore;
        if (!db.objectStoreNames.contains('items')) {
           // Type assertion needed for legacy store 'books' cleanup
           if (db.objectStoreNames.contains('books' as any)) {
             db.deleteObjectStore('books' as any); 
           }
           itemStore = db.createObjectStore('items', { keyPath: 'id' });
        } else {
           itemStore = transaction.objectStore('items');
        }

        if (!itemStore.indexNames.contains('by-library')) itemStore.createIndex('by-library', 'libraryId');
        if (!itemStore.indexNames.contains('by-title')) itemStore.createIndex('by-title', 'title');
        if (!itemStore.indexNames.contains('by-added')) itemStore.createIndex('by-added', 'addedAt');
        if (!itemStore.indexNames.contains('by-last-read')) itemStore.createIndex('by-last-read', 'lastReadAt');
        if (!itemStore.indexNames.contains('is-favorite')) itemStore.createIndex('is-favorite', 'isFavorite');

        // 3. Handles Store
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles', { keyPath: 'id' });
        }

        // 4. Progress Store
        let progressStore;
        if (!db.objectStoreNames.contains('progress')) {
          progressStore = db.createObjectStore('progress', { keyPath: 'bookId' });
        } else {
          progressStore = transaction.objectStore('progress');
        }
        if (!progressStore.indexNames.contains('by-last-read')) progressStore.createIndex('by-last-read', 'lastReadAt');

        // 5. Bookmarks Store
        let bookmarkStore;
        if (!db.objectStoreNames.contains('bookmarks')) {
            bookmarkStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
            bookmarkStore.createIndex('by-book', 'bookId');
        }

        // 6. Playlists Store (New)
        if (!db.objectStoreNames.contains('playlists')) {
            db.createObjectStore('playlists', { keyPath: 'id' });
        }

        // 7. Settings Store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
};

export const getDB = () => {
  if (!dbPromise) throw new Error("Database not initialized");
  return dbPromise;
};

// --- Helper: Revive Legacy Handles ---
const reviveHandle = (handle: any): any => {
  if (!handle) return handle;
  if (handle.kind === 'file' && handle.file instanceof File) {
     if (typeof handle.getFile !== 'function') {
         return {
             kind: 'file',
             name: handle.name,
             file: handle.file,
             getFile: async () => handle.file,
             queryPermission: async () => 'granted',
             requestPermission: async () => 'granted'
         };
     }
  }
  return handle;
};

// --- DAOs ---

export const dbAddLibrary = async (library: Library) => {
  const db = await getDB();
  return db.put('libraries', library);
};

export const dbDeleteLibrary = async (id: string) => {
  const db = await getDB();
  const tx = db.transaction(['libraries', 'items', 'handles'], 'readwrite');
  
  await tx.objectStore('libraries').delete(id);
  
  const itemsIndex = tx.objectStore('items').index('by-library');
  let cursor = await itemsIndex.openCursor(IDBKeyRange.only(id));
  
  while (cursor) {
    await tx.objectStore('handles').delete(cursor.value.id);
    await cursor.delete();
    cursor = await cursor.continue();
  }
  
  await tx.done;
};

export const dbGetLibraries = async () => {
  const db = await getDB();
  return db.getAll('libraries');
};

export const dbAddItem = async (item: BookMetadata) => {
  const db = await getDB();
  return db.put('items', item);
};

export const dbUpdateBook = async (book: BookMetadata) => {
    const db = await getDB();
    return db.put('items', book);
};

export const dbSaveProgress = async (progress: ReadingProgress) => {
  const db = await getDB();
  return db.put('progress', progress);
};

export const dbGetAllProgress = async (): Promise<ReadingProgress[]> => {
    const db = await getDB();
    return db.getAll('progress');
};

export const dbGetBooksForLibrary = async (libraryId: string): Promise<Book[]> => {
  const db = await getDB();
  
  const items = await db.getAllFromIndex('items', 'by-library', libraryId);
  const result: Book[] = [];
  
  const tx = db.transaction('handles', 'readonly');
  const handleStore = tx.objectStore('handles');
  
  for (const item of items) {
    const h = await handleStore.get(item.id);
    if (h) {
      const pages = h.pages ? h.pages.map(p => ({
          ...p,
          handle: reviveHandle(p.handle)
      })) : [];

      result.push({
        ...item,
        handle: reviveHandle(h.handle),
        coverHandle: reviveHandle(h.coverHandle),
        pages: pages
      } as Book);
    }
  }
  
  return result;
};

// --- Bookmarks ---

export const dbAddBookmark = async (bookId: string, pageIndex: number) => {
    const db = await getDB();
    const id = `${bookId}_${pageIndex}`;
    await db.put('bookmarks', {
        id,
        bookId,
        pageIndex,
        createdAt: Date.now()
    });
};

export const dbRemoveBookmark = async (bookId: string, pageIndex: number) => {
    const db = await getDB();
    const id = `${bookId}_${pageIndex}`;
    await db.delete('bookmarks', id);
};

export const dbGetBookmarksForBook = async (bookId: string): Promise<number[]> => {
    const db = await getDB();
    const bookmarks = await db.getAllFromIndex('bookmarks', 'by-book', bookId);
    return bookmarks.map(b => b.pageIndex);
};

export const dbGetAllBookmarks = async (): Promise<Bookmark[]> => {
    const db = await getDB();
    return db.getAll('bookmarks');
};

// --- Playlists ---

export const dbCreatePlaylist = async (name: string): Promise<Playlist> => {
    const db = await getDB();
    const playlist: Playlist = {
        id: crypto.randomUUID(),
        name,
        bookIds: [],
        createdAt: Date.now()
    };
    await db.put('playlists', playlist);
    return playlist;
};

export const dbGetPlaylists = async (): Promise<Playlist[]> => {
    const db = await getDB();
    return db.getAll('playlists');
};

export const dbAddBookToPlaylist = async (playlistId: string, bookId: string) => {
    const db = await getDB();
    const playlist = await db.get('playlists', playlistId);
    if (playlist && !playlist.bookIds.includes(bookId)) {
        playlist.bookIds.push(bookId);
        await db.put('playlists', playlist);
    }
};

export const dbRemoveBookFromPlaylist = async (playlistId: string, bookId: string) => {
    const db = await getDB();
    const playlist = await db.get('playlists', playlistId);
    if (playlist) {
        playlist.bookIds = playlist.bookIds.filter(id => id !== bookId);
        await db.put('playlists', playlist);
    }
};

export const dbDeletePlaylist = async (playlistId: string) => {
    const db = await getDB();
    await db.delete('playlists', playlistId);
};

// --- Settings ---
export const dbGetSetting = async (key: string) => {
    const db = await getDB();
    return db.get('settings', key);
};

export const dbSaveSetting = async (key: string, value: any) => {
    const db = await getDB();
    return db.put('settings', { key, value });
};

export const dbGetReaderSettings = async (): Promise<ReaderSettings> => {
    const setting = await dbGetSetting('reader_settings');
    const defaults: ReaderSettings = {
        direction: 'LTR',
        fitMode: 'contain',
        viewMode: 'vertical', 
        slideshowInterval: 3,
        smartSplit: false,
        enableSfx: true,
        atmosphere: 'none',
        lightingMode: 'ambient',
        textureMode: 'washi', // Default changed to washi
        transitionMode: 'snap' // Default changed to snap
    };
    return setting ? { ...defaults, ...setting.value } : defaults;
};

export const dbSaveReaderSettings = async (settings: ReaderSettings) => {
    return dbSaveSetting('reader_settings', settings);
};

// --- Favorite Folders ---
export const dbGetFavoriteFolders = async (): Promise<string[]> => {
    const setting = await dbGetSetting('favorite_folders');
    return setting ? setting.value : [];
};

export const dbToggleFavoriteFolder = async (path: string) => {
    const current = await dbGetFavoriteFolders();
    const set = new Set(current);
    if (set.has(path)) {
        set.delete(path);
    } else {
        set.add(path);
    }
    await dbSaveSetting('favorite_folders', Array.from(set));
    return Array.from(set);
};
