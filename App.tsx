
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { LibraryList } from './components/LibraryList';
import { AppShell } from './components/AppShell';
import { RadialMenu } from './components/RadialMenu';
import { CurationModal } from './components/CurationModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppState, Library, BookMetadata, ReadingProgress, Theme, ReaderSettings, LibraryViewMode, Book, Playlist } from './types';
import { LibraryScanner } from './services/libraryScanner';
import { initDB, dbGetLibraries, dbAddLibrary, dbDeleteLibrary, dbGetBooksForLibrary, dbGetAllProgress, dbUpdateBook, dbSaveProgress, dbGetSetting, dbSaveSetting, dbGetReaderSettings, dbSaveReaderSettings, dbGetPlaylists, dbAddBookToPlaylist, dbCreatePlaylist } from './services/db';
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

  // Extra state for features
  const [settings, setSettings] = useState<ReaderSettings>({
      direction: 'LTR', fitMode: 'contain', viewMode: 'vertical', 
      slideshowInterval: 3, smartSplit: false,
      enableSfx: true, textureMode: 'grain', transitionMode: 'slide',
      atmosphere: 'none', lightingMode: 'ambient'
  });
  const [libViewMode, setLibViewMode] = useState<LibraryViewMode>('category');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Curation Modal State
  const [curationModalOpen, setCurationModalOpen] = useState(false);
  const [bookToCurate, setBookToCurate] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  // Reader Actions State (for Menu)
  const [bookmarkAction, setBookmarkAction] = useState<(() => void) | null>(null);
  const [isPageBookmarked, setIsPageBookmarked] = useState(false);

  // Virtual Book State (Collected Moments)
  const [virtualBook, setVirtualBook] = useState<Book | null>(null);

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
        const [libs, savedTheme, savedSettings] = await Promise.all([
            refreshLibraries(),
            dbGetSetting('theme'),
            dbGetReaderSettings()
        ]);
        
        await refreshPlaylists();
        
        const initialTheme = savedTheme?.value || 'sakura-night';
        document.documentElement.setAttribute('data-theme', initialTheme);
        document.body.setAttribute('data-texture', savedSettings.textureMode);
        document.body.setAttribute('data-lighting', savedSettings.lightingMode);

        setSettings(savedSettings);

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

  useEffect(() => {
      const handleMove = (e: MouseEvent) => {
          if (settings.lightingMode === 'spotlight') {
              document.documentElement.style.setProperty('--cursor-x', `${e.clientX}px`);
              document.documentElement.style.setProperty('--cursor-y', `${e.clientY}px`);
          }
      };
      window.addEventListener('mousemove', handleMove);
      return () => window.removeEventListener('mousemove', handleMove);
  }, [settings.lightingMode]);

  // --- Handlers ---
  const handleToggleTheme = async (newTheme: Theme) => {
      setState(prev => ({ ...prev, theme: newTheme }));
      document.documentElement.setAttribute('data-theme', newTheme);
      await dbSaveSetting('theme', newTheme);
  };
  
  const handleCycleTheme = () => {
       const themes: Theme[] = ['sakura-night', 'ivory-paper', 'ink-blossom', 'cyber-grid', 'autumn-scroll', 'nordic-frost'];
       const next = themes[(themes.indexOf(state.theme) + 1) % themes.length];
       handleToggleTheme(next);
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
    // Skip saving progress for virtual books
    if (bookId === 'collected-moments') return;

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

  const handleOpenVirtualBook = (book: Book) => {
      if(settings.enableSfx) playClickSfx();
      setVirtualBook(book);
      setState(prev => ({ ...prev, activeBookId: 'collected-moments', view: 'READER' }));
  };

  const handleGoHome = () => {
     if(settings.enableSfx) playClickSfx();
     setState(prev => ({ ...prev, view: 'LIBRARY_LIST', activeLibraryId: null, activeBookId: null }));
  };

  const handleCloseReader = useCallback(() => {
    if(settings.enableSfx) playClickSfx();
    setVirtualBook(null);
    setState(prev => ({ ...prev, activeBookId: null, view: 'LIBRARY' }));
  }, [settings.enableSfx]);

  const activeBook = state.activeBookId === 'collected-moments' ? virtualBook : state.libraryBooks.find(b => b.id === state.activeBookId);

  const handleBack = () => {
      if (state.view === 'READER') handleCloseReader();
      else if (state.view === 'LIBRARY') handleGoHome();
  };

  const handleAddToCuration = async (playlistId: string | null, newName?: string) => {
      if (!bookToCurate) return;
      let targetId = playlistId;

      if (!targetId && newName) {
          const newPl = await dbCreatePlaylist(newName);
          targetId = newPl.id;
      }

      if (targetId) {
          await dbAddBookToPlaylist(targetId, bookToCurate);
          await refreshPlaylists();
      }
      setCurationModalOpen(false);
      setBookToCurate(null);
  };

  return (
    <>
        <RadialMenu 
            currentView={state.view}
            onBack={handleBack}
            onSearch={() => setIsSearchOpen(true)}
            currentTheme={state.theme} 
            onThemeChange={handleToggleTheme}
            settings={settings}
            onSettingChange={handleSettingChange}
            viewMode={libViewMode}
            onViewModeChange={setLibViewMode}
            activeBookId={null}
            onToggleFavorite={async (id) => {
                const b = state.libraryBooks.find(book => book.id === id);
                if(b) handleUpdateBook(id, { isFavorite: !b.isFavorite });
            }}
            onAddToCuration={(id) => {
                setBookToCurate(id);
                setCurationModalOpen(true);
            }}
            onEditBook={() => {}}
            onTogglePageBookmark={() => bookmarkAction && bookmarkAction()}
            isPageBookmarked={isPageBookmarked}
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
              onRegisterBookmarkAction={setBookmarkAction}
              onBookmarkStatusChange={setIsPageBookmarked}
            />
        ) : (
             <AppShell
                libraries={state.libraries}
                activeLibraryId={state.activeLibraryId}
                onSelectLibrary={handleSelectLibrary}
                onGoHome={handleGoHome}
                currentTheme={state.theme}
                onToggleTheme={handleCycleTheme}
             >
                {state.view === 'LIBRARY_LIST' && (
                    <LibraryList 
                      libraries={state.libraries}
                      onAddLibrary={handleAddLibrary}
                      onSelectLibrary={handleSelectLibrary}
                      onDeleteLibrary={handleDeleteLibrary}
                      onToggleTheme={handleCycleTheme}
                    />
                )}
                
                {state.view === 'LIBRARY' && (
                    <LibraryView 
                      books={state.libraryBooks} 
                      onSelectBook={handleSelectBook} 
                      onUpdateBook={handleUpdateBook}
                      onGoHome={handleGoHome}
                      onToggleTheme={handleCycleTheme}
                      viewMode={libViewMode}
                      enableSfx={settings.enableSfx}
                      isSearchOpen={isSearchOpen}
                      onToggleSearch={setIsSearchOpen}
                      onOpenVirtualBook={handleOpenVirtualBook}
                      playlists={playlists}
                      onRefreshPlaylists={refreshPlaylists}
                    />
                )}
             </AppShell>
        )}

        <CurationModal 
            isOpen={curationModalOpen}
            onClose={() => setCurationModalOpen(false)}
            playlists={playlists}
            onAddToCuration={handleAddToCuration}
        />

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
