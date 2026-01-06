
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Book, LibraryViewMode, Playlist, BookMetadata, FileHandle, Page, Bookmark } from '../types';
import { generateThumbnail } from '../utils/imageUtils';
import { dbUpdateBook, dbGetFavoriteFolders, dbGetPlaylists, dbCreatePlaylist, dbAddBookToPlaylist, dbDeletePlaylist, dbGetAllBookmarks, dbGetBooksForLibrary, dbGetAllProgress } from '../services/db';
import { Search, Heart, ChevronLeft, Folder, X, Plus, MoreVertical, Trash2, FolderHeart, Sparkles, Bookmark as BookmarkIcon, Home } from 'lucide-react';
import { CurationModal } from './CurationModal';
import { naturalSort } from '../utils/fileUtils';
import { playClickSfx, playHoverSfx } from '../services/audio';
import { getFileUrl } from '../services/fileSystem';

interface LibraryViewProps {
  books: Book[];
  onSelectBook: (bookId: string) => void;
  onUpdateBook: (bookId: string, changes: Partial<Book>) => void;
  onGoHome: () => void;
  onToggleTheme: () => void;
  viewMode: LibraryViewMode;
  enableSfx: boolean;
  isSearchOpen: boolean; 
  onToggleSearch: (open: boolean) => void;
  onOpenVirtualBook: (book: Book) => void;
  playlists: Playlist[];
  onRefreshPlaylists: () => void;
}

const PatinaOverlay: React.FC<{ readCount: number }> = ({ readCount }) => {
    if (readCount < 2) return null;
    const intensity = Math.min(1, Math.max(0, (readCount - 2) / 30)); 
    return (
        <div className="absolute inset-0 pointer-events-none z-20 opacity-30">
             {/* Zen Patina is very subtle noise */}
             <div className="absolute inset-0 bg-black/5 mix-blend-overlay" style={{ opacity: intensity }} />
        </div>
    );
};

// Floating Zen Book Card
const BookCard: React.FC<{ 
    book: Book; 
    onClick: () => void;
    onContextMenu?: (e: React.MouseEvent, book: Book) => void;
    width?: number | string;
    height?: number | string;
    className?: string;
    priority?: boolean;
    showProgress?: boolean;
    style?: React.CSSProperties;
}> = React.memo(({ book, onClick, onContextMenu, width, height, className, priority, showProgress = true, style }) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Load Cover
  useEffect(() => {
    let active = true;
    const loadCover = async () => {
      if (book.coverImage) {
        if (active) setCoverUrl(URL.createObjectURL(book.coverImage));
        return; 
      }
      if (book.coverHandle) {
        try {
            const file = await book.coverHandle.getFile();
            if (file.size < 20 * 1024 * 1024) { 
                 const thumbnailBlob = await generateThumbnail(file);
                 await dbUpdateBook({ ...book, coverImage: thumbnailBlob, handle: undefined, pages: undefined, coverHandle: undefined, readingProgress: undefined } as any);
                 if (active) setCoverUrl(URL.createObjectURL(thumbnailBlob));
            }
        } catch (e) { /* silent */ }
      }
    };
    loadCover();
    return () => { active = false; if (coverUrl) URL.revokeObjectURL(coverUrl); };
  }, [book.id, book.coverImage]); 

  // Preview Logic
  useEffect(() => {
      let interval: any = null;
      let activeUrl: string | null = null;

      if (isHovered && book.pages && book.pages.length > 1) {
          let idx = 1;
          interval = setInterval(async () => {
              if (idx >= Math.min(6, book.pages.length)) idx = 1;
              const page = book.pages[idx];
              if (page && page.handle) {
                   try {
                       const url = await getFileUrl(page.handle);
                       if(activeUrl) URL.revokeObjectURL(activeUrl);
                       activeUrl = url;
                       setPreviewUrl(url);
                       setPreviewIndex(idx);
                   } catch(e) {}
              }
              idx++;
          }, 800);
      } else {
          setPreviewUrl(null);
          setPreviewIndex(0);
          if (activeUrl) URL.revokeObjectURL(activeUrl);
      }

      return () => {
          if (interval) clearInterval(interval);
          if (activeUrl) URL.revokeObjectURL(activeUrl);
      };
  }, [isHovered, book.pages]);

  const progress = book.readingProgress;
  const percentage = progress?.percentage || 0;
  const displayUrl = previewUrl || coverUrl;

  return (
    <div 
      onClick={onClick}
      onContextMenu={(e) => onContextMenu && onContextMenu(e, book)}
      onMouseEnter={() => { setIsHovered(true); playHoverSfx(); }}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative flex-shrink-0 cursor-pointer group ${book.isHidden ? 'opacity-40' : 'opacity-100'} ${className || ''}`}
      style={{ width, height, ...style }}
      data-book-id={book.id}
    >
      {/* Floating Card Design */}
      <div className={`relative w-full h-full bg-[var(--bg-card)] overflow-hidden transition-all duration-500 ease-[var(--ease-out-expo)] aspect-[2/3] border border-[var(--border-glass)] shadow-sm group-hover:scale-105 group-hover:shadow-[var(--shadow-zen)] rounded-lg`}>
        <PatinaOverlay readCount={book.readCount || 0} />
        
        {displayUrl ? (
          <img 
            src={displayUrl} 
            alt={book.title} 
            className={`w-full h-full object-cover transition-all duration-700 ${isHovered ? 'opacity-100' : 'opacity-90 grayscale-[0.1]'}`} 
            loading={priority ? "eager" : "lazy"} 
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-card)] p-4">
            <span className="mono text-[10px] uppercase text-[var(--text-muted)] tracking-widest break-all text-center opacity-50">{book.title.slice(0, 4)}</span>
          </div>
        )}

        {/* Minimal Info Overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-[var(--bg-overlay)] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-6 z-30`}>
             <h3 className="text-[var(--text-main)] font-semibold text-sm leading-tight line-clamp-2 tracking-tight drop-shadow-sm">{book.title}</h3>
        </div>
        
        {book.isFavorite && (
            <div className="absolute top-3 right-3 text-[var(--accent)] z-30"><Heart className="w-3 h-3 fill-current" strokeWidth={1} /></div>
        )}
        
        {showProgress && percentage > 0 && percentage < 100 && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/10 z-30">
                <div className="h-full bg-[var(--accent)]" style={{ width: `${percentage}%` }} />
            </div>
        )}
      </div>
    </div>
  );
});

type Tab = 'collections' | 'curations' | 'bookmarks';

// Component to render a single bookmarked page thumbnail
const BookmarkThumbnail: React.FC<{ book: Book; pageIndex: number; onClick: () => void }> = React.memo(({ book, pageIndex, onClick }) => {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        if (book.pages && book.pages[pageIndex]) {
            getFileUrl(book.pages[pageIndex].handle).then(u => {
                if (active) setUrl(u);
            });
        }
        return () => { active = false; if(url) URL.revokeObjectURL(url); };
    }, [book, pageIndex]);

    return (
        <div onClick={onClick} className="flex flex-col gap-4 group cursor-pointer">
            <div className="relative w-full aspect-[2/3] bg-[var(--bg-card)] rounded-lg overflow-hidden border border-[var(--border-glass)] group-hover:shadow-[var(--shadow-zen)] group-hover:scale-105 transition-all duration-500">
                {url ? (
                    <img src={url} alt="Bookmark" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 rounded-full border border-t-[var(--accent)] animate-spin"/></div>
                )}
                <div className="absolute top-2 right-2 text-red-500 z-10 drop-shadow-md">
                     <BookmarkIcon className="w-5 h-5 fill-current" strokeWidth={1} />
                </div>
            </div>
             <div className="flex flex-col">
                <p className="font-medium text-sm text-[var(--text-main)] leading-tight truncate">{book.title}</p>
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mt-1">Page {pageIndex + 1}</p>
            </div>
        </div>
    );
});


export const LibraryView: React.FC<LibraryViewProps> = ({ 
    books, onSelectBook, onUpdateBook, onGoHome, viewMode, enableSfx,
    isSearchOpen, onToggleSearch, onOpenVirtualBook,
    playlists, onRefreshPlaylists
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('collections');
  const [search, setSearch] = useState('');
  const [currentPath, setCurrentPath] = useState<string>(''); 
  const [favoriteFolders, setFavoriteFolders] = useState<Set<string>>(new Set());
  const [rawBookmarks, setRawBookmarks] = useState<Bookmark[]>([]);
  
  // Curation Modal State
  const [isCurationModalOpen, setIsCurationModalOpen] = useState(false);
  const [bookToCurate, setBookToCurate] = useState<string | null>(null);

  useEffect(() => { 
      dbGetFavoriteFolders().then(folders => setFavoriteFolders(new Set(folders))); 
  }, []);
  
  useEffect(() => {
      if (activeTab === 'bookmarks') {
          dbGetAllBookmarks().then(res => setRawBookmarks(res));
      }
  }, [activeTab]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
      if (isSearchOpen && searchInputRef.current) searchInputRef.current.focus();
      if (!isSearchOpen) setSearch('');
  }, [isSearchOpen]);

  const sortedBooks = useMemo(() => {
    let filtered = books.filter(b => (b.title.toLowerCase().includes(search.toLowerCase())) && !b.isHidden);
    return filtered.sort((a, b) => naturalSort(a.title, b.title));
  }, [books, search]);

  const { categorizedGroups, currentFolderBooks } = useMemo(() => {
    if (viewMode !== 'category') return { categorizedGroups: [], currentFolderBooks: sortedBooks };
    const groups: Record<string, Book[]> = {};
    const flatBooks: Book[] = [];
    sortedBooks.forEach(book => {
        if (!book.path.startsWith(currentPath)) return;
        let relativePath = currentPath ? book.path.substring(currentPath.length + (currentPath ? 1 : 0)) : book.path;
        const parts = relativePath.split('/');
        if (parts.length === 1) flatBooks.push(book);
        else {
            const sub = parts[0];
            if (!groups[sub]) groups[sub] = [];
            groups[sub].push(book);
        }
    });
    const resultGroups = Object.keys(groups).sort(naturalSort).map(key => ({ 
        title: key.replace(/[_-]/g, ' '), originalPath: currentPath ? `${currentPath}/${key}` : key, books: groups[key] 
    }));
    return { categorizedGroups: resultGroups, currentFolderBooks: flatBooks };
  }, [sortedBooks, currentPath, viewMode]);

  const favoriteBooks = useMemo(() => books.filter(b => b.isFavorite), [books]);

  const handleContextMenu = useCallback((e: React.MouseEvent, book: Book) => {
      e.preventDefault(); 
  }, []);

  const handleAddToCuration = async (playlistId: string | null, newName?: string) => {
      let targetId = playlistId;

      if (!targetId && newName) {
          const newPl = await dbCreatePlaylist(newName);
          targetId = newPl.id;
      }

      if (targetId && bookToCurate) {
          await dbAddBookToPlaylist(targetId, bookToCurate);
      }
      
      onRefreshPlaylists();
      setIsCurationModalOpen(false);
      setBookToCurate(null);
  };
  
  const handleDeletePlaylist = async (id: string) => {
      if(confirm("Delete this curation?")) {
          await dbDeletePlaylist(id);
          onRefreshPlaylists();
      }
  };

  const handleOpenBookmark = (book: Book, pageIndex: number) => {
      // We need to set the book's progress to the bookmark page
      // But we don't want to persist this jump as "Reading Progress" immediately until they read.
      // For simplicity, we just update the book state in memory to start at that page.
      // However, ReaderView uses `readingProgress.currentPageIndex` or 0.
      
      // We'll create a transient copy of the book with modified progress
      const transientBook = {
          ...book,
          readingProgress: {
              ...(book.readingProgress || { bookId: book.id, totalPages: book.pageCount, percentage: 0, status: 'unread', lastReadAt: Date.now() }),
              currentPageIndex: pageIndex
          }
      };
      // We can't just pass this to onOpenVirtualBook, we need to pass it to the main reader
      // The main reader state takes ID. 
      // A trick is to update the DB progress *before* opening.
      dbUpdateBook({ ...book, readingProgress: transientBook.readingProgress } as any).then(() => {
          onSelectBook(book.id);
      });
  };

  // --- Render Sections ---

  const renderCollections = () => (
      <div className="pb-40 pt-40 px-12 md:px-20">
          {viewMode === 'category' && !search ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="mb-16">
                      {currentPath && (
                          <div className="flex items-center gap-4 mb-8">
                             <button onClick={() => setCurrentPath(currentPath.split('/').slice(0, -1).join('/'))} className="group flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors glass-panel px-4 py-2 rounded-full">
                                 <ChevronLeft className="w-4 h-4" strokeWidth={1} />
                                 <span className="text-xs font-semibold tracking-wide">Back</span>
                             </button>
                             <h1 className="text-2xl font-semibold text-[var(--text-main)]">{currentPath.split('/').pop()?.replace(/[_-]/g, ' ')}</h1>
                          </div>
                      )}
                  </div>
                  {categorizedGroups.map((group) => (
                      <div key={group.originalPath} className="mb-20">
                           <div className="flex items-center gap-4 mb-8 cursor-pointer group" onClick={() => setCurrentPath(group.originalPath)}>
                                <h2 className="text-lg font-semibold text-[var(--text-main)] flex items-center gap-3">
                                    <Folder className={`w-5 h-5 ${favoriteFolders.has(group.originalPath) ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} strokeWidth={1} />
                                    {group.title}
                                </h2>
                                <span className="text-[10px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity tracking-widest uppercase">Open Folder</span>
                           </div>
                           <div className="flex overflow-x-auto gap-8 pb-8 scrollbar-hide -mx-2 px-2">
                               {group.books.map(b => (
                                   <BookCard key={b.id} book={b} width={200} height={300} onClick={() => onSelectBook(b.id)} onContextMenu={handleContextMenu} />
                               ))}
                           </div>
                      </div>
                  ))}
                  {currentFolderBooks.length > 0 && (
                      <div className="mt-16">
                          <h2 className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] mb-10 pl-2">Items</h2>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-12 gap-y-16">
                              {currentFolderBooks.map(book => (
                                  <div key={book.id} className="flex flex-col gap-4 group">
                                      <BookCard book={book} width="100%" height="auto" onClick={() => onSelectBook(book.id)} onContextMenu={handleContextMenu} />
                                      <p className="font-medium text-sm text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors leading-tight">{book.title}</p>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
          ) : (
              <div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-12 gap-y-20">
                      {(search ? sortedBooks : currentFolderBooks).map(book => (
                          <div key={book.id} className="flex flex-col gap-4 group">
                              <BookCard book={book} width="100%" height="auto" onClick={() => onSelectBook(book.id)} onContextMenu={handleContextMenu} />
                              <p className="font-medium text-sm text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors leading-tight">{book.title}</p>
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>
  );

  const renderCurations = () => (
      <div className="px-12 md:px-20 pt-40 pb-40 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-12">
              <h2 className="text-2xl font-semibold text-[var(--text-main)] tracking-tight">Curations</h2>
              <button onClick={() => { setBookToCurate(null); setIsCurationModalOpen(true); }} className="flex items-center gap-2 px-5 py-2 glass-panel rounded-full hover:bg-[var(--text-main)] hover:text-[var(--bg-main)] transition-colors">
                  <Plus className="w-4 h-4" /> <span className="text-xs font-semibold uppercase tracking-wide">New</span>
              </button>
          </div>
          <div className="space-y-20">
              <div className="relative">
                  <div className="flex items-center gap-4 mb-8">
                      <h3 className="text-lg font-medium flex items-center gap-3 text-[var(--accent)]">
                          <Heart className="w-4 h-4 fill-current" strokeWidth={1} />
                          Favorites
                      </h3>
                      <span className="text-xs text-[var(--text-muted)]">{favoriteBooks.length}</span>
                  </div>
                  <div className="flex overflow-x-auto gap-8 pb-4 scrollbar-hide -mx-2 px-2">
                      {favoriteBooks.length === 0 && <div className="text-[var(--text-muted)] italic px-2 text-sm">No favorites yet.</div>}
                      {favoriteBooks.map(b => (
                          <BookCard key={b.id} book={b} width={180} height={270} onClick={() => onSelectBook(b.id)} onContextMenu={handleContextMenu} />
                      ))}
                  </div>
              </div>

              {playlists.map(pl => (
                  <div key={pl.id} className="relative">
                      <div className="flex items-center gap-4 mb-8">
                          <h3 className="text-lg font-medium flex items-center gap-3">
                              <FolderHeart className="w-4 h-4 text-[var(--accent)]" strokeWidth={1} />
                              {pl.name}
                          </h3>
                          <span className="text-xs text-[var(--text-muted)]">{pl.bookIds.length}</span>
                          <button onClick={() => handleDeletePlaylist(pl.id)} className="ml-auto text-red-500 hover:text-red-400 opacity-30 hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" strokeWidth={1}/></button>
                      </div>
                      <div className="flex overflow-x-auto gap-8 pb-4 scrollbar-hide -mx-2 px-2">
                          {pl.bookIds.map(id => {
                              const b = books.find(book => book.id === id);
                              if (!b) return null;
                              return <BookCard key={b.id} book={b} width={180} height={270} onClick={() => onSelectBook(b.id)} onContextMenu={handleContextMenu} />
                          })}
                      </div>
                  </div>
              ))}
          </div>
      </div>
  );

  const renderBookmarks = () => {
      // Filter bookmarks for existing books only
      const validBookmarks = rawBookmarks.filter(bm => books.some(b => b.id === bm.bookId));

      return (
        <div className="px-12 md:px-20 pt-40 pb-40 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-semibold text-[var(--text-main)] mb-12 tracking-tight">Bookmarks</h2>
            {validBookmarks.length === 0 ? (
                 <div className="text-[var(--text-muted)] italic text-sm">No bookmarks yet. Right click in reader to add one.</div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-12 gap-y-16">
                    {validBookmarks.map(bm => {
                        const book = books.find(b => b.id === bm.bookId);
                        if(!book) return null;
                        return (
                            <BookmarkThumbnail 
                                key={bm.id} 
                                book={book} 
                                pageIndex={bm.pageIndex} 
                                onClick={() => handleOpenBookmark(book, bm.pageIndex)} 
                            />
                        );
                    })}
                </div>
            )}
        </div>
      );
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)] transition-colors duration-700 relative">
      
      {/* Zen Search Bar Overlay */}
      {isSearchOpen && (
          <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[90] w-full max-w-xl px-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="glass-panel rounded-full flex items-center px-6 py-4 gap-4 shadow-2xl">
                  <Search className="w-5 h-5 text-[var(--accent)]" strokeWidth={1} />
                  <input ref={searchInputRef} type="text" placeholder="Search library..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent text-lg font-medium text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none" />
                  <button onClick={() => onToggleSearch(false)}><X className="w-5 h-5 text-[var(--text-muted)]" strokeWidth={1} /></button>
              </div>
          </div>
      )}

      {/* FLOATING PILL NAVIGATION (Replaces stiff header) */}
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-40 flex items-center justify-center pointer-events-none">
          <div className="glass-panel p-1.5 rounded-full flex items-center gap-2 pointer-events-auto shadow-[var(--shadow-zen)]">
             
             {/* Home Button */}
             <button onClick={onGoHome} className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors" title="Home">
                <Home className="w-4 h-4" strokeWidth={1.5} />
             </button>

             <div className="w-[1px] h-4 bg-[var(--border-glass)] mx-1" />

             {/* Tab Switcher */}
             {['collections', 'curations', 'bookmarks'].map(tab => (
                 <button 
                    key={tab}
                    onClick={() => { setActiveTab(tab as Tab); if(enableSfx) playClickSfx(); }} 
                    className={`px-5 py-2 rounded-full text-xs font-semibold tracking-wide transition-all ${activeTab === tab ? 'bg-[var(--text-main)] text-[var(--bg-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]'}`}
                 >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                 </button>
             ))}

             <div className="w-[1px] h-4 bg-[var(--border-glass)] mx-1" />

             {/* Search Trigger */}
             <button onClick={() => onToggleSearch(!isSearchOpen)} className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors" title="Search">
                <Search className="w-4 h-4" strokeWidth={1.5} />
             </button>

          </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-smooth">
          {activeTab === 'collections' && renderCollections()}
          {activeTab === 'curations' && renderCurations()}
          {activeTab === 'bookmarks' && renderBookmarks()}
      </div>

      <CurationModal 
        isOpen={isCurationModalOpen} 
        onClose={() => setIsCurationModalOpen(false)}
        playlists={playlists}
        onAddToCuration={handleAddToCuration}
      />
    </div>
  );
};
