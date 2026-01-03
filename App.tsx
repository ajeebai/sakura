
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { LibraryList } from './components/LibraryList';
import { AppShell } from './components/AppShell';
import { RadialMenu } from './components/RadialMenu';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppState, Library, BookMetadata, ReadingProgress, Theme, ReaderSettings, LibraryViewMode, MenuContext, Playlist, Book } from './types';
import { LibraryScanner } from './services/libraryScanner';
import { initDB, dbGetLibraries, dbAddLibrary, dbDeleteLibrary, dbGetBooksForLibrary, dbGetAllProgress, dbUpdateBook, dbSaveProgress, dbGetSetting, dbSaveSetting, dbGetReaderSettings, dbSaveReaderSettings, dbGetPlaylists, dbCreatePlaylist, dbAddBookToPlaylist, dbRemoveBookFromPlaylist, dbDeletePlaylist, dbGetBookmarksForBook, dbAddBookmark, dbRemoveBookmark } from './services/db';
import { hydrateBook, verifyPermission } from './services/fileSystem';
import { processLegacyFileList, scanFilesFromDataTransfer } from './utils/fileSystemPolyfill';
import { playClickSfx, playHoverSfx, setAtmosphere } from './services/audio';

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

  const [settings, setSettings] = useState<ReaderSettings>({
      direction: 'LTR', fitMode: 'contain', viewMode: 'vertical', 
      slideshowInterval: 3, smartSplit: false,
      enableSfx: true, textureMode: 'grain', transitionMode: 'slide',
      atmosphere: 'none', lightingMode: 'ambient'
  });
  
  const [libViewMode, setLibViewMode] = useState<LibraryViewMode>('category');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Radial Menu State
  const [menuContext, setMenuContext] = useState<MenuContext | null>(null);
  
  // Playlist State
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  
  // Bookmarks State for Reader
  const [activeBookBookmarks, setActiveBookBookmarks] = useState<Set<number>>(new Set());
  const [readerCurrentPage, setReaderCurrentPage] = useState(0);

  const legacyInputRef = useRef<HTMLInputElement>(null);

  const refreshLibraries = useCallback(async () => {
    const libs = await dbGetLibraries();
    return libs;
  }, []);

  const refreshPlaylists = useCallback(async () => {
      const pl = await dbGetPlaylists();
      setPlaylists(pl);
  }, []);

  // Initialization
  useEffect(() => {
    const startUp = async () => {
      try {
        await initDB();
        const [libs, savedTheme, savedSettings, _pl] = await Promise.all([
            refreshLibraries(),
            dbGetSetting('theme'),
            dbGetReaderSettings(),
            refreshPlaylists()
        ]);
        
        const initialTheme = savedTheme?.value || 'sakura-night';
        document.documentElement.setAttribute('data-theme', initialTheme);
        document.body.setAttribute('data-texture', savedSettings.textureMode);
        document.body.setAttribute('data-lighting', savedSettings.lightingMode);

        setSettings(savedSettings);

        if (savedSettings.atmosphere && savedSettings.atmosphere !== 'none') {
             // Atmosphere will start on user interaction
        }

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
  }, [refreshLibraries, refreshPlaylists]);

  // Global Context Menu Handler (Right Click)
  useEffect(() => {
      const handleGlobalContextMenu = (e: MouseEvent) => {
          e.preventDefault();
          // If we are NOT in the reader view, and NOT right-clicking a book card (handled separately)
          // We trigger the global menu.
          // Note: BookCard and ReaderView stopPropagation, so this only fires on background.
          
          if (state.view === 'LIBRARY' || state.view === 'LIBRARY_LIST') {
               setMenuContext({
                   type: 'GLOBAL',
                   x: e.clientX,
                   y: e.clientY
               });
               if(settings.enableSfx) playClickSfx();
          }
      };
      
      window.addEventListener('contextmenu', handleGlobalContextMenu);
      return () => window.removeEventListener('contextmenu', handleGlobalContextMenu);
  }, [state.view, settings.enableSfx]);

  const handleBookContextMenu = (e: React.MouseEvent, book: Book) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuContext({
          type: 'BOOK',
          x: e.clientX,
          y: e.clientY,
          data: book
      });
      if(settings.enableSfx) playClickSfx();
  };

  const handleReaderContextMenu = (e: React.MouseEvent, pageIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuContext({
          type: 'READER',
          x: e.clientX,
          y: e.clientY
      });
      if(settings.enableSfx) playClickSfx();
  };

  const handleCloseMenu = () => setMenuContext(null);

  // --- Playlist Actions ---
  const handleCreatePlaylist = async () => {
      const name = prompt("Enter playlist name:");
      if (name) {
          await dbCreatePlaylist(name);
          await refreshPlaylists();
      }
  };

  const handleAddToPlaylist = async (playlistId: string, bookId: string) => {
      await dbAddBookToPlaylist(playlistId, bookId);
      await refreshPlaylists();
      setMenuContext(null);
  };
  
  const handleDeletePlaylist = async (id: string) => {
      if(confirm('Delete this playlist?')) {
          await dbDeletePlaylist(id);
          await refreshPlaylists();
      }
  };

  // --- Reader Actions ---
  const handleTogglePageBookmark = async () => {
      if (!state.activeBookId) return;
      
      const newSet = new Set(activeBookBookmarks);
      if (newSet.has(readerCurrentPage)) {
          newSet.delete(readerCurrentPage);
          await dbRemoveBookmark(state.activeBookId, readerCurrentPage);
      } else {
          newSet.add(readerCurrentPage);
          await dbAddBookmark(state.activeBookId, readerCurrentPage);
      }
      setActiveBookBookmarks(newSet);
      if(settings.enableSfx) playClickSfx();
      setMenuContext(null); // Close menu after action
  };


  // --- Handlers ---
  const handleToggleTheme = async (newTheme: Theme) => {
      setState(prev => ({ ...prev, theme: newTheme }));
      document.documentElement.setAttribute('data-theme', newTheme);
      await dbSaveSetting('theme', newTheme);
  };

  const handleSettingChange = async (key: keyof ReaderSettings, value: any) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      
      if (key === 'textureMode') document.body.setAttribute('data-texture', value);
      if (key === 'lightingMode') document.body.setAttribute('data-lighting', value);
      if (key === 'atmosphere') setAtmosphere(value);
      
      await dbSaveReaderSettings(newSettings);
  };

  const handleAddLibrary = async () => {
    if (state.libraries.length >= 5) {
      alert("You have reached the maximum of 5 libraries.");
      return;
    }
    if ('showDirectoryPicker' in window) {
        try {
            const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
            await processNativeHandle(dirHandle);
        } catch (err: any) {
            if (err.name !== 'AbortError') console.error(err);
        }
    } else {
      legacyInputRef.current?.click();
    }
  };

  const processNativeHandle = async (dirHandle: any) => {
    setState(prev => ({ ...prev, loading: true, loadingMessage: 'Scanning library...' }));
    setTimeout(async () => {
        try {
            const libraryId = crypto.randomUUID();
            const newLibrary: Library = {
                id: libraryId,
                name: dirHandle.name,
                handle: dirHandle,
                addedAt: Date.now()
            };
            await dbAddLibrary(newLibrary);
            
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
    }, 100);
  };

  const handleLegacyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    await processLegacyFiles(Array.from(e.target.files));
    if (legacyInputRef.current) legacyInputRef.current.value = '';
  };

  const processLegacyFiles = async (files: File[]) => {
    setState(prev => ({ ...prev, loading: true, loadingMessage: 'Importing files...' }));
    
    setTimeout(async () => {
        try {
            const result = await processLegacyFileList(files);
            const libraryId = result.books[0]?.libraryId || crypto.randomUUID();
            const newLibrary: Library = {
                id: libraryId,
                name: result.libraryName,
                handle: { kind: 'directory', name: result.libraryName } as any, 
                addedAt: Date.now()
            };
            await dbAddLibrary(newLibrary);
            const db = await (await import('./services/db')).getDB();
            const tx = db.transaction(['items', 'handles'], 'readwrite');
            const itemStore = tx.objectStore('items');
            const handleStore = tx.objectStore('handles');
            for (const book of result.books) await itemStore.put(book);
            for (const h of result.handles) await handleStore.put(h);
            await tx.done;
            const updatedLibs = await refreshLibraries();
            await handleSelectLibrary(newLibrary);
            setState(prev => ({ ...prev, libraries: updatedLibs }));
        } catch (e) {
            console.error("Legacy import failed", e);
            setState(prev => ({ ...prev, loading: false, loadingMessage: '' }));
        }
    }, 100);
  };

  const handleDropFiles = async (dataTransfer: DataTransfer) => {
      if (state.libraries.length >= 5) return;
      const items = dataTransfer.items;
      if (items && items.length > 0 && 'getAsFileSystemHandle' in items[0]) {
          try {
             for (let i = 0; i < items.length; i++) {
                 const handle = await (items[i] as any).getAsFileSystemHandle();
                 if (handle && handle.kind === 'directory') {
                     await processNativeHandle(handle);
                     return;
                 }
             }
          } catch (e) {}
      }
      try {
          setState(prev => ({ ...prev, loading: true, loadingMessage: 'Scanning dropped folder...' }));
          const files = await scanFilesFromDataTransfer(items);
          if (files.length > 0) await processLegacyFiles(files);
          else setState(prev => ({ ...prev, loading: false, loadingMessage: '' }));
      } catch (e) {
          setState(prev => ({ ...prev, loading: false, loadingMessage: '' }));
      }
  };

  const handleSelectLibrary = async (library: Library) => {
    if(settings.enableSfx) playClickSfx();
    setState(prev => ({ ...prev, loading: true, loadingMessage: 'Opening library...' }));
    
    if ('showDirectoryPicker' in window && (library.handle as any).queryPermission) {
        const hasPerm = await verifyPermission(library.handle);
        if (!hasPerm) {
          setState(prev => ({ ...prev, loading: false, loadingMessage: '' }));
          alert("Permission denied.");
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
        dbUpdateBook({ ...newBook, handle: undefined, pages: undefined, coverHandle: undefined } as any);
        const newBooks = [...prev.libraryBooks];
        newBooks[bookIndex] = newBook;
        return { ...prev, libraryBooks: newBooks };
    });
  }, []);

  const handleUpdateProgress = useCallback(async (bookId: string, pageIndex: number, totalPages: number) => {
    const percentage = Math.round(((pageIndex + 1) / totalPages) * 100);
    const status = percentage >= 100 ? 'completed' : 'in_progress';
    const progress: ReadingProgress = {
      bookId, currentPageIndex: pageIndex, totalPages, percentage, status, lastReadAt: Date.now()
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
    if(settings.enableSfx) playClickSfx();
    const bookIndex = state.libraryBooks.findIndex(b => b.id === bookId);
    if (bookIndex === -1) return;
    const book = state.libraryBooks[bookIndex];
    
    // Load Bookmarks for this book
    const marks = await dbGetBookmarksForBook(bookId);
    setActiveBookBookmarks(new Set(marks));
    setReaderCurrentPage(book.readingProgress?.currentPageIndex || 0);

    if (book.pages && book.pages.length > 0) {
        setState(prev => ({ ...prev, activeBookId: bookId, view: 'READER', loading: false }));
        return;
    }
    if (book.format === 'image_folder' || book.format === 'archive') {
        setState(prev => ({ ...prev, loading: true, loadingMessage: 'Opening book...' }));
        try {
            const hydrated = await hydrateBook(book);
             setState(prev => {
                const newBooks = [...prev.libraryBooks];
                newBooks[bookIndex] = { ...hydrated, readingProgress: book.readingProgress };
                return { ...prev, libraryBooks: newBooks, activeBookId: bookId, view: 'READER', loading: false, loadingMessage: '' };
             });
        } catch (e) { setState(prev => ({ ...prev, loading: false })); }
    } else {
        setState(prev => ({ ...prev, activeBookId: bookId, view: 'READER' }));
    }
  }, [state.libraryBooks, settings.enableSfx]);

  const handleGoHome = () => {
     if(settings.enableSfx) playClickSfx();
     setState(prev => ({ ...prev, view: 'LIBRARY_LIST', activeLibraryId: null, activeBookId: null }));
  };

  const handleCloseReader = useCallback(() => {
    if(settings.enableSfx) playClickSfx();
    setState(prev => ({ ...prev, activeBookId: null, view: 'LIBRARY' }));
  }, [settings.enableSfx]);

  const activeBook = state.libraryBooks.find(b => b.id === state.activeBookId);

  return (
    <>
        <RadialMenu 
            context={menuContext}
            onClose={handleCloseMenu}
            
            // Data
            currentTheme={state.theme} 
            settings={settings}
            viewMode={libViewMode}
            playlists={playlists}
            isPageBookmarked={activeBookBookmarks.has(readerCurrentPage)}

            // Actions
            onThemeChange={handleToggleTheme}
            onSettingChange={handleSettingChange}
            onViewModeChange={setLibViewMode}
            onSearch={() => setIsSearchOpen(true)}
            onGoHome={handleGoHome}
            
            onToggleFavorite={(bookId) => {
                 const book = state.libraryBooks.find(b => b.id === bookId);
                 if (book) handleUpdateBook(bookId, { isFavorite: !book.isFavorite });
                 setMenuContext(null);
            }}
            onAddToPlaylist={handleAddToPlaylist}
            onCreatePlaylist={handleCreatePlaylist}
            onEditBook={() => { /* Edit Modal Triggered by local state usually, we can refactor later if needed, but context menu usually just opens edit modal */}}
            
            onTogglePageBookmark={handleTogglePageBookmark}
        />

        <input type="file" ref={legacyInputRef} className="hidden" multiple onChange={handleLegacyFileSelect} {...{ webkitdirectory: "", directory: "" } as any} />
        
        {state.view === 'WELCOME' ? (
             <WelcomeScreen 
               onOpenLibrary={handleAddLibrary}
               onDropFiles={handleDropFiles}
               isLoading={state.loading}
               loadingMessage={state.loadingMessage}
               isBrowserSupported={true} 
             />
        ) : state.view === 'READER' && activeBook ? (
            <ReaderView 
              book={activeBook} 
              onClose={handleCloseReader} 
              onUpdateProgress={handleUpdateProgress}
              settings={settings} 
              onSettingChange={handleSettingChange}
              onContextMenu={handleReaderContextMenu}
              currentPage={readerCurrentPage}
              setCurrentPage={setReaderCurrentPage}
              bookmarks={activeBookBookmarks}
            />
        ) : (
             <AppShell
                libraries={state.libraries}
                activeLibraryId={state.activeLibraryId}
                onSelectLibrary={handleSelectLibrary}
                onGoHome={handleGoHome}
                currentTheme={state.theme}
                onToggleTheme={() => handleToggleTheme('ivory-paper')}
             >
                {state.view === 'LIBRARY_LIST' && (
                    <LibraryList 
                      libraries={state.libraries}
                      onAddLibrary={handleAddLibrary}
                      onSelectLibrary={handleSelectLibrary}
                      onDeleteLibrary={handleDeleteLibrary}
                      onToggleTheme={() => handleToggleTheme('ivory-paper')}
                    />
                )}
                
                {state.view === 'LIBRARY' && (
                    <LibraryView 
                      books={state.libraryBooks} 
                      onSelectBook={handleSelectBook} 
                      onUpdateBook={handleUpdateBook}
                      onGoHome={handleGoHome}
                      onToggleTheme={() => handleToggleTheme('ivory-paper')}
                      viewMode={libViewMode}
                      enableSfx={settings.enableSfx}
                      isSearchOpen={isSearchOpen}
                      onToggleSearch={setIsSearchOpen}
                      onContextMenu={handleBookContextMenu}
                      playlists={playlists}
                      onCreatePlaylist={handleCreatePlaylist}
                      onDeletePlaylist={handleDeletePlaylist}
                    />
                )}
             </AppShell>
        )}

        {/* Fullscreen Blurry Loader */}
        {state.loading && state.view !== 'WELCOME' && (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-500">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <div className="w-16 h-16 border border-white/20 rounded-full loader-ring"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-2 h-2 bg-[var(--accent)] rounded-full animate-pulse"></div>
                        </div>
                    </div>
                    <p className="text-white font-serif tracking-widest text-lg animate-pulse min-h-[1.5rem]">{state.loadingMessage || 'Loading...'}</p>
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