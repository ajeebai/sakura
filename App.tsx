import React, { useState, useCallback, useEffect, useRef } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { LibraryList } from './components/LibraryList';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppState, Library, BookMetadata, ReadingProgress, Theme } from './types';
import { LibraryScanner } from './services/libraryScanner';
import { initDB, dbGetLibraries, dbAddLibrary, dbDeleteLibrary, dbGetBooksForLibrary, dbGetAllProgress, dbUpdateBook, dbSaveProgress, dbGetSetting, dbSaveSetting, dbAddItem, getDB } from './services/db';
import { hydrateBook, verifyPermission } from './services/fileSystem';
import { processLegacyFileList, scanFilesFromDataTransfer } from './utils/fileSystemPolyfill';

const SakuraApp: React.FC = () => {
  const [state, setState] = useState<AppState>({
    view: 'WELCOME',
    libraries: [],
    libraryBooks: [],
    activeLibraryId: null,
    activeBookId: null,
    loading: true,
    loadingMessage: 'Initializing system...',
    isDbReady: false,
    theme: 'sakura-night'
  });

  const legacyInputRef = useRef<HTMLInputElement>(null);

  const refreshLibraries = useCallback(async () => {
    const libs = await dbGetLibraries();
    return libs;
  }, []);

  useEffect(() => {
    const startUp = async () => {
      try {
        await initDB();
        const [libs, savedTheme] = await Promise.all([
            refreshLibraries(),
            dbGetSetting('theme')
        ]);
        
        const initialTheme = savedTheme?.value || 'sakura-night';
        document.body.setAttribute('data-theme', initialTheme);

        setState(prev => ({ 
          ...prev, 
          libraries: libs,
          view: libs.length > 0 ? 'LIBRARY_LIST' : 'WELCOME',
          loading: false, 
          loadingMessage: '', 
          isDbReady: true,
          theme: initialTheme
        }));
      } catch (e) {
        console.error("Failed to init DB", e);
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          loadingMessage: 'Failed to initialize database.' 
        }));
      }
    };
    startUp();
  }, [refreshLibraries]);

  // --- Theme Toggle ---
  const handleToggleTheme = async () => {
      const themes: Theme[] = ['sakura-night', 'ivory-paper', 'ink-blossom'];
      const currentIndex = themes.indexOf(state.theme);
      const nextTheme = themes[(currentIndex + 1) % themes.length];
      
      setState(prev => ({ ...prev, theme: nextTheme }));
      document.body.setAttribute('data-theme', nextTheme);
      await dbSaveSetting('theme', nextTheme);
  };

  // --- Actions ---

  const handleAddLibrary = async () => {
    if (state.libraries.length >= 5) {
      alert("You have reached the maximum of 5 libraries.");
      return;
    }

    // Check for native support
    if ('showDirectoryPicker' in window) {
        try {
            const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
            await processNativeHandle(dirHandle);
        } catch (err: any) {
            if (err.name !== 'AbortError') console.error(err);
        }
    } else {
      // Trigger legacy input
      legacyInputRef.current?.click();
    }
  };

  const processNativeHandle = async (dirHandle: any) => {
    try {
        const libraryId = crypto.randomUUID();
        const newLibrary: Library = {
            id: libraryId,
            name: dirHandle.name,
            handle: dirHandle,
            addedAt: Date.now()
        };

        await dbAddLibrary(newLibrary);

        setState(prev => ({ ...prev, loading: true, loadingMessage: 'Scanning library...' }));
        const scanner = new LibraryScanner();
        await scanner.scan(libraryId, dirHandle, (msg) => {
            setState(prev => ({ ...prev, loadingMessage: msg }));
        });
        scanner.terminate();

        const updatedLibs = await refreshLibraries();
        await handleSelectLibrary(newLibrary);
        
        setState(prev => ({ ...prev, libraries: updatedLibs }));
    } catch (err) {
        console.error("Native import failed", err);
        setState(prev => ({ ...prev, loading: false, loadingMessage: '' }));
    }
  };

  const handleLegacyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    await processLegacyFiles(Array.from(e.target.files));
    if (legacyInputRef.current) legacyInputRef.current.value = '';
  };

  const processLegacyFiles = async (files: File[]) => {
    setState(prev => ({ ...prev, loading: true, loadingMessage: 'Importing files...' }));
    
    try {
        const result = await processLegacyFileList(files);
        
        // Save Library
        const libraryId = result.books[0]?.libraryId || crypto.randomUUID();
        const newLibrary: Library = {
            id: libraryId,
            name: result.libraryName,
            handle: { kind: 'directory', name: result.libraryName } as any, 
            addedAt: Date.now()
        };
        
        await dbAddLibrary(newLibrary);

        // Save Books & Handles manually
        const db = await getDB();
        const tx = db.transaction(['items', 'handles'], 'readwrite');
        const itemStore = tx.objectStore('items');
        const handleStore = tx.objectStore('handles');

        for (const book of result.books) {
            await itemStore.put(book);
        }
        for (const h of result.handles) {
            await handleStore.put(h);
        }
        await tx.done;

        const updatedLibs = await refreshLibraries();
        await handleSelectLibrary(newLibrary);
        setState(prev => ({ ...prev, libraries: updatedLibs }));

    } catch (e) {
        console.error("Legacy import failed", e);
        alert("Failed to import library. " + (e as any).message);
        setState(prev => ({ ...prev, loading: false, loadingMessage: '' }));
    }
  };

  // --- Smart Drop Handler (Handles both Chrome Handles and Firefox/Legacy Entries) ---
  const handleDropFiles = async (dataTransfer: DataTransfer) => {
      if (state.libraries.length >= 5) {
        alert("You have reached the maximum of 5 libraries.");
        return;
      }

      // Strategy 1: Modern File System Access API (Chrome/Edge)
      const items = dataTransfer.items;
      if (items && items.length > 0 && 'getAsFileSystemHandle' in items[0]) {
          try {
             // Just grab the first directory dropped
             for (let i = 0; i < items.length; i++) {
                 const handle = await (items[i] as any).getAsFileSystemHandle();
                 if (handle && handle.kind === 'directory') {
                     await processNativeHandle(handle);
                     return;
                 }
             }
          } catch (e) { console.warn("Native drag-drop failed, trying legacy...", e); }
      }

      // Strategy 2: WebKit Entry API (Firefox / Safari / Fallback)
      // This requires scanning the directory entry to build a flat file list
      try {
          setState(prev => ({ ...prev, loading: true, loadingMessage: 'Scanning dropped folder...' }));
          const files = await scanFilesFromDataTransfer(items);
          if (files.length > 0) {
              await processLegacyFiles(files);
          } else {
              setState(prev => ({ ...prev, loading: false, loadingMessage: '' }));
          }
      } catch (e) {
          console.error("Drop scan failed", e);
          setState(prev => ({ ...prev, loading: false, loadingMessage: '' }));
      }
  };

  const handleSelectLibrary = async (library: Library) => {
    setState(prev => ({ ...prev, loading: true, loadingMessage: 'Opening library...' }));

    // Permission check only needed for Native Handles
    if ('showDirectoryPicker' in window && (library.handle as any).queryPermission) {
        const hasPerm = await verifyPermission(library.handle);
        if (!hasPerm) {
          setState(prev => ({ ...prev, loading: false, loadingMessage: '' }));
          alert("Permission denied. Cannot access library.");
          return;
        }
    }

    const [books, allProgress] = await Promise.all([
        dbGetBooksForLibrary(library.id),
        dbGetAllProgress()
    ]);

    const progressMap = new Map(allProgress.map(p => [p.bookId, p]));
    const booksWithProgress = books.map(book => ({
        ...book,
        readingProgress: progressMap.get(book.id)
    }));
    
    setState(prev => ({
      ...prev,
      activeLibraryId: library.id,
      libraryBooks: booksWithProgress,
      view: 'LIBRARY',
      loading: false,
      loadingMessage: ''
    }));
  };

  const handleDeleteLibrary = async (id: string) => {
    await dbDeleteLibrary(id);
    const updatedLibs = await refreshLibraries();
    setState(prev => ({
       ...prev,
       libraries: updatedLibs,
       activeLibraryId: null,
       view: updatedLibs.length === 0 ? 'WELCOME' : 'LIBRARY_LIST'
    }));
  };

  const handleUpdateBook = useCallback(async (bookId: string, changes: Partial<BookMetadata>) => {
    setState(prev => {
        const bookIndex = prev.libraryBooks.findIndex(b => b.id === bookId);
        if (bookIndex === -1) return prev;

        const oldBook = prev.libraryBooks[bookIndex];
        const newBook = { ...oldBook, ...changes };

        const metadataToSave: BookMetadata = {
            id: newBook.id,
            libraryId: newBook.libraryId,
            title: newBook.title,
            path: newBook.path,
            pageCount: newBook.pageCount,
            format: newBook.format,
            addedAt: newBook.addedAt,
            lastReadAt: newBook.lastReadAt,
            coverImage: newBook.coverImage,
            tags: newBook.tags,
            isFavorite: newBook.isFavorite,
            isHidden: newBook.isHidden
        };

        dbUpdateBook(metadataToSave).catch(err => console.error("Failed to save book update", err));

        const newBooks = [...prev.libraryBooks];
        newBooks[bookIndex] = newBook;

        return { ...prev, libraryBooks: newBooks };
    });
  }, []);

  const handleUpdateProgress = useCallback(async (bookId: string, pageIndex: number, totalPages: number) => {
    const percentage = Math.round(((pageIndex + 1) / totalPages) * 100);
    const status = percentage >= 100 ? 'completed' : 'in_progress';
    const progress: ReadingProgress = {
      bookId,
      currentPageIndex: pageIndex,
      totalPages,
      percentage,
      status,
      lastReadAt: Date.now()
    };

    await dbSaveProgress(progress);

    setState(prev => {
      const bookIndex = prev.libraryBooks.findIndex(b => b.id === bookId);
      if (bookIndex === -1) return prev;

      const newBooks = [...prev.libraryBooks];
      newBooks[bookIndex] = { ...newBooks[bookIndex], readingProgress: progress };

      return { ...prev, libraryBooks: newBooks };
    });
  }, []);

  const handleSelectBook = useCallback(async (bookId: string) => {
    const bookIndex = state.libraryBooks.findIndex(b => b.id === bookId);
    if (bookIndex === -1) return;
    
    const book = state.libraryBooks[bookIndex];
    
    // Check if book already has pages (Legacy import puts pages in memory/DB immediately)
    if (book.pages && book.pages.length > 0) {
        setState(prev => ({ 
            ...prev, 
            activeBookId: bookId, 
            view: 'READER',
            loading: false 
        }));
        return;
    }
    
    // Both Image Folders and Archives need hydration to list pages
    if (book.format === 'image_folder' || book.format === 'archive') {
        setState(prev => ({ ...prev, loading: true, loadingMessage: 'Opening book...' }));
        try {
            const hydrated = await hydrateBook(book);
             setState(prev => {
                const newBooks = [...prev.libraryBooks];
                newBooks[bookIndex] = { ...hydrated, readingProgress: book.readingProgress };
                return { 
                  ...prev, 
                  libraryBooks: newBooks,
                  activeBookId: bookId, 
                  view: 'READER',
                  loading: false,
                  loadingMessage: ''
                };
             });
        } catch (e) {
            console.error("Failed to hydrate book", e);
             setState(prev => ({ ...prev, loading: false }));
        }
    } else {
        // PDFs do not need hydration (they load inside ReaderView)
        setState(prev => ({ ...prev, activeBookId: bookId, view: 'READER' }));
    }
  }, [state.libraryBooks]);

  const handleGoHome = () => {
     setState(prev => ({ ...prev, view: 'LIBRARY_LIST', activeLibraryId: null, activeBookId: null }));
  };

  const handleCloseReader = useCallback(() => {
    setState(prev => ({ ...prev, activeBookId: null, view: 'LIBRARY' }));
  }, []);

  const activeBook = state.libraryBooks.find(b => b.id === state.activeBookId);

  // --- Render ---

  if (state.view === 'WELCOME') {
    return (
        <>
            <input 
                type="file" 
                ref={legacyInputRef} 
                className="hidden" 
                multiple 
                onChange={handleLegacyFileSelect} 
                {...{ webkitdirectory: "", directory: "" } as any}
            />
            <WelcomeScreen 
              onOpenLibrary={handleAddLibrary}
              onDropFiles={handleDropFiles}
              isLoading={state.loading}
              loadingMessage={state.loadingMessage}
              isBrowserSupported={true} 
            />
        </>
    );
  }

  if (state.view === 'READER' && activeBook) {
      return (
        <ReaderView 
          book={activeBook} 
          onClose={handleCloseReader} 
          onUpdateProgress={handleUpdateProgress}
        />
      );
  }

  return (
    <>
        <input 
            type="file" 
            ref={legacyInputRef} 
            className="hidden" 
            multiple 
            onChange={handleLegacyFileSelect} 
            {...{ webkitdirectory: "", directory: "" } as any}
        />
        <AppShell
            libraries={state.libraries}
            activeLibraryId={state.activeLibraryId}
            onSelectLibrary={handleSelectLibrary}
            onGoHome={handleGoHome}
            currentTheme={state.theme}
            onToggleTheme={handleToggleTheme}
        >
            {state.view === 'LIBRARY_LIST' && (
                <LibraryList 
                  libraries={state.libraries}
                  onAddLibrary={handleAddLibrary}
                  onSelectLibrary={handleSelectLibrary}
                  onDeleteLibrary={handleDeleteLibrary}
                  onToggleTheme={handleToggleTheme}
                />
            )}
            
            {state.view === 'LIBRARY' && (
                <LibraryView 
                  books={state.libraryBooks} 
                  onSelectBook={handleSelectBook} 
                  onUpdateBook={handleUpdateBook}
                  onGoHome={handleGoHome}
                  onToggleTheme={handleToggleTheme}
                />
            )}
        </AppShell>

        {state.loading && (
            <div className="fixed inset-0 z-[60] bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <div className="w-10 h-10 border-4 border-[var(--border-color)] border-t-[var(--accent)] rounded-full animate-spin mb-4" />
                    <p className="text-[var(--text-muted)] font-medium animate-pulse">{state.loadingMessage}</p>
                </div>
            </div>
        )}
    </>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <SakuraApp />
    </ErrorBoundary>
  );
};

export default App;