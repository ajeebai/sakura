
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Book, LibraryViewMode, Playlist, BookMetadata, FileHandle, Page } from '../types';
import { generateThumbnail, generatePdfThumbnail, generateArchiveThumbnail } from '../utils/imageUtils';
import { dbUpdateBook, dbGetFavoriteFolders, dbGetPlaylists, dbCreatePlaylist, dbAddBookToPlaylist, dbDeletePlaylist, dbGetAllBookmarks, dbGetBooksForLibrary, dbGetAllProgress } from '../services/db';
import { Search, Heart, ChevronLeft, Folder, X, Plus, MoreVertical, Trash2, FolderHeart, Sparkles } from 'lucide-react';
import { EditBookModal } from './EditBookModal';
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
  // New: Passed from App for sync
  playlists: Playlist[];
  onRefreshPlaylists: () => void;
}

const PatinaOverlay: React.FC<{ readCount: number }> = ({ readCount }) => {
    if (readCount < 2) return null;
    const intensity = Math.min(1, Math.max(0, (readCount - 2) / 30)); 
    return (
        <div className="absolute inset-0 pointer-events-none z-20">
            {readCount > 5 && (
                <div className="absolute top-0 right-0 w-16 h-16 patina-crease" style={{ opacity: intensity * 0.5 }} />
            )}
            <div className="absolute inset-0 bg-yellow-100/10 mix-blend-multiply" style={{ opacity: intensity * 0.3 }} />
        </div>
    );
};

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

  const progress = book.readingProgress;
  const percentage = progress?.percentage || 0;

  return (
    <div 
      onClick={onClick}
      onContextMenu={(e) => onContextMenu && onContextMenu(e, book)}
      onMouseEnter={() => playHoverSfx()}
      className={`relative flex-shrink-0 cursor-pointer group ${book.isHidden ? 'opacity-40' : 'opacity-100'} ${className || ''}`}
      style={{ width, height, ...style }}
      data-book-id={book.id}
    >
      <div className={`relative w-full h-full bg-[var(--bg-card)] overflow-hidden transition-all duration-300 ease-[var(--ease-out-expo)] aspect-[2/3] border border-[var(--border-color)] shadow-md group-hover:scale-105 group-hover:shadow-xl group-hover:border-[var(--text-main)] group-hover:z-50 rounded-sm`}>
        <PatinaOverlay readCount={book.readCount || 0} />
        {coverUrl ? (
          <img src={coverUrl} alt={book.title} className="w-full h-full object-cover grayscale-[0.2] contrast-[1.1] transition-all duration-1000 group-hover:grayscale-0" loading={priority ? "eager" : "lazy"} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-card)] p-4 border border-dashed border-[var(--border-color)]">
            <span className="mono text-[10px] uppercase text-[var(--text-muted)] tracking-widest break-all text-center">{book.title.slice(0, 4)}</span>
          </div>
        )}
        <div className={`absolute inset-0 bg-gradient-to-t from-[var(--bg-overlay)] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-4 z-30`}>
             <h3 className="text-[var(--text-main)] font-medium text-sm leading-tight line-clamp-2 font-serif drop-shadow-md">{book.title}</h3>
        </div>
        {book.isFavorite && (
            <div className="absolute top-2 right-2 text-[var(--accent)] drop-shadow-md z-30"><Heart className="w-3 h-3 fill-current" /></div>
        )}
        {showProgress && percentage > 0 && percentage < 100 && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/20 z-30">
                <div className="h-full bg-[var(--accent)]" style={{ width: `${percentage}%` }} />
            </div>
        )}
      </div>
    </div>
  );
});

type Tab = 'collections' | 'curations' | 'bookmarks';

export const LibraryView: React.FC<LibraryViewProps> = ({ 
    books, onSelectBook, onUpdateBook, onGoHome, viewMode, enableSfx,
    isSearchOpen, onToggleSearch, onOpenVirtualBook,
    playlists, onRefreshPlaylists
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('collections');
  const [search, setSearch] = useState('');
  const [currentPath, setCurrentPath] = useState<string>(''); 
  const [favoriteFolders, setFavoriteFolders] = useState<Set<string>>(new Set());
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  
  // Curation Modal State
  const [isCurationModalOpen, setIsCurationModalOpen] = useState(false);
  const [bookToCurate, setBookToCurate] = useState<string | null>(null);

  useEffect(() => { 
      dbGetFavoriteFolders().then(folders => setFavoriteFolders(new Set(folders))); 
      // Playlists passed via props now
  }, []);

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

  const bookmarkedBooks = useMemo(() => books.filter(b => b.isFavorite), [books]);

  const handleContextMenu = useCallback((e: React.MouseEvent, book: Book) => {
      e.preventDefault(); 
  }, []);

  const handleAddToCuration = async (playlistId: string | null, newName?: string) => {
      if (!bookToCurate) return;
      let targetId = playlistId;

      if (!targetId && newName) {
          const newPl = await dbCreatePlaylist(newName);
          targetId = newPl.id;
      }

      if (targetId) {
          await dbAddBookToPlaylist(targetId, bookToCurate);
          onRefreshPlaylists();
      }
      setIsCurationModalOpen(false);
      setBookToCurate(null);
  };
  
  const handleDeletePlaylist = async (id: string) => {
      if(confirm("Delete this curation?")) {
          await dbDeletePlaylist(id);
          onRefreshPlaylists();
      }
  };

  const handleOpenCollectedMoments = async () => {
      const allBookmarks = await dbGetAllBookmarks();
      if (allBookmarks.length === 0) {
          alert("No bookmarks found yet.");
          return;
      }
      const pages: Page[] = [];
      for (const bm of allBookmarks) {
          const book = books.find(b => b.id === bm.bookId);
          if (book && book.pages && book.pages[bm.pageIndex]) {
              pages.push(book.pages[bm.pageIndex]);
          }
      }
      if (pages.length === 0) {
           alert("Could not load bookmarked pages (files might be in another library).");
           return;
      }
      const virtualBook: Book = {
          id: 'collected-moments',
          title: 'Collected Moments',
          path: 'virtual',
          pageCount: pages.length,
          format: 'image_folder',
          addedAt: Date.now(),
          pages: pages,
          handle: { kind: 'directory', name: 'Virtual' } as any, // Dummy
          coverHandle: null
      };
      onOpenVirtualBook(virtualBook);
  };

  // --- Render Sections ---

  const renderCollections = () => (
      <div className="pb-32 pt-8">
          {viewMode === 'category' && !search ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="px-8 mb-12">
                      {currentPath && (
                          <div className="flex items-baseline gap-4 mb-12">
                             <button onClick={() => setCurrentPath(currentPath.split('/').slice(0, -1).join('/'))} className="group flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                                 <ChevronLeft className="w-4 h-4" />
                                 <span className="mono text-xs uppercase tracking-widest">Back</span>
                             </button>
                             <h1 className="text-4xl font-serif text-[var(--text-main)]">{currentPath.split('/').pop()?.replace(/[_-]/g, ' ')}</h1>
                          </div>
                      )}
                  </div>
                  {categorizedGroups.map((group) => (
                      <div key={group.originalPath} className="mb-12 px-8">
                           <div className="flex items-baseline gap-4 mb-6 cursor-pointer group border-b border-[var(--border-color)] pb-2" onClick={() => setCurrentPath(group.originalPath)}>
                                <h2 className="text-2xl font-serif text-[var(--text-main)] flex items-center gap-2">
                                    <Folder className={`w-4 h-4 ${favoriteFolders.has(group.originalPath) ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                                    {group.title}
                                </h2>
                                <span className="mono text-[10px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">Open Folder</span>
                           </div>
                           <div className="flex overflow-x-auto gap-6 pb-4 scrollbar-hide -mx-4 px-4 py-4">
                               {group.books.map(b => (
                                   <BookCard key={b.id} book={b} width={180} height={270} onClick={() => onSelectBook(b.id)} onContextMenu={handleContextMenu} />
                               ))}
                           </div>
                      </div>
                  ))}
                  {currentFolderBooks.length > 0 && (
                      <div className="px-8 mt-12">
                          <h2 className="mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-8">Items</h2>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-12">
                              {currentFolderBooks.map(book => (
                                  <div key={book.id} className="flex flex-col gap-3 group">
                                      <BookCard book={book} width="100%" height="auto" onClick={() => onSelectBook(book.id)} onContextMenu={handleContextMenu} />
                                      <p className="font-serif text-sm text-[var(--text-muted)] group-hover:text-[var(--text-main)] leading-tight">{book.title}</p>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
          ) : (
              <div className="px-8 md:px-12">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-16">
                      {(search ? sortedBooks : currentFolderBooks).map(book => (
                          <div key={book.id} className="flex flex-col gap-3 group">
                              <BookCard book={book} width="100%" height="auto" onClick={() => onSelectBook(book.id)} onContextMenu={handleContextMenu} />
                              <p className="font-serif text-sm text-[var(--text-muted)] group-hover:text-[var(--text-main)] leading-tight">{book.title}</p>
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>
  );

  const renderCurations = () => (
      <div className="px-8 pt-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-serif text-[var(--text-main)]">Your Curations</h2>
              <button onClick={() => { setBookToCurate(null); setIsCurationModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-full hover:bg-[var(--text-main)] hover:text-[var(--bg-main)] transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> <span className="mono text-xs uppercase">New Curation</span>
              </button>
          </div>
          <div className="space-y-12">
              {playlists.map(pl => (
                  <div key={pl.id} className="relative">
                      <div className="flex items-center gap-4 mb-6 border-b border-[var(--border-color)] pb-2">
                          <h3 className="text-xl font-serif flex items-center gap-2">
                              <FolderHeart className="w-5 h-5 text-[var(--accent)]" />
                              {pl.name}
                          </h3>
                          <span className="mono text-xs text-[var(--text-muted)]">{pl.bookIds.length} items</span>
                          <button onClick={() => handleDeletePlaylist(pl.id)} className="ml-auto text-red-500 hover:text-red-400 opacity-50 hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4"/></button>
                      </div>
                      <div className="flex overflow-x-auto gap-6 pb-4 scrollbar-hide -mx-4 px-4">
                          {pl.bookIds.length === 0 && <div className="text-[var(--text-muted)] italic px-4 text-sm">Empty curation. Right click a book to add it.</div>}
                          {pl.bookIds.map(id => {
                              const b = books.find(book => book.id === id);
                              if (!b) return null;
                              return <BookCard key={b.id} book={b} width={160} height={240} onClick={() => onSelectBook(b.id)} onContextMenu={handleContextMenu} />;
                          })}
                      </div>
                  </div>
              ))}
          </div>
      </div>
  );

  const renderBookmarks = () => (
      <div className="px-8 pt-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-3xl font-serif text-[var(--text-main)] mb-8">Favorites & Moments</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-12">
               
               {/* Collected Moments Card */}
               <div 
                  onClick={handleOpenCollectedMoments}
                  className="flex flex-col gap-3 group cursor-pointer"
               >
                   <div className="relative w-full aspect-[2/3] bg-[var(--bg-card)] border border-[var(--border-color)] shadow-md group-hover:shadow-xl group-hover:scale-105 transition-all duration-300 flex items-center justify-center overflow-hidden">
                       <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] to-purple-900 opacity-20 group-hover:opacity-30 transition-opacity" />
                       <Sparkles className="w-12 h-12 text-[var(--text-main)] opacity-50 mb-2" />
                       <span className="absolute bottom-4 font-serif text-[var(--text-main)] text-lg">Collected Moments</span>
                       <div className="absolute inset-0 border-2 border-[var(--accent)] opacity-10 m-2" />
                   </div>
                   <p className="font-serif text-sm text-[var(--text-muted)] group-hover:text-[var(--text-main)]">Virtual Compilation</p>
               </div>

               {bookmarkedBooks.map(book => (
                  <div key={book.id} className="flex flex-col gap-3 group">
                      <BookCard book={book} width="100%" height="auto" onClick={() => onSelectBook(book.id)} onContextMenu={handleContextMenu} />
                      <p className="font-serif text-sm text-[var(--text-muted)] group-hover:text-[var(--text-main)] leading-tight">{book.title}</p>
                  </div>
               ))}
          </div>
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)] transition-colors duration-700 relative">
      
      {/* Search Overlay */}
      {isSearchOpen && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[90] w-full max-w-2xl px-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="bg-[var(--bg-card)]/90 backdrop-blur-md border border-[var(--border-color)] rounded-2xl shadow-2xl flex items-center p-4 gap-4 ring-1 ring-[var(--text-main)]/10">
                  <Search className="w-6 h-6 text-[var(--accent)]" />
                  <input ref={searchInputRef} type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent text-xl font-serif text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none" />
                  <button onClick={() => onToggleSearch(false)}><X className="w-5 h-5 text-[var(--text-muted)]" /></button>
              </div>
          </div>
      )}

      {/* Header with Tabs */}
      <header className={`fixed top-0 left-0 right-0 z-40 h-24 flex items-center justify-between px-8 glass-panel border-b border-[var(--border-color)]`}>
         <div className="flex items-center gap-6">
            <button onClick={onGoHome} className="mono text-xs uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex items-center gap-2">
                <Folder className="w-4 h-4" /> Home
            </button>
         </div>

         {/* Central Tabs */}
         <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-8">
             <button onClick={() => { setActiveTab('collections'); if(enableSfx) playClickSfx(); }} className={`text-sm font-serif transition-colors ${activeTab === 'collections' ? 'text-[var(--text-main)] border-b border-[var(--accent)] pb-1' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>Collections</button>
             <button onClick={() => { setActiveTab('curations'); if(enableSfx) playClickSfx(); }} className={`text-sm font-serif transition-colors ${activeTab === 'curations' ? 'text-[var(--text-main)] border-b border-[var(--accent)] pb-1' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>Curations</button>
             <button onClick={() => { setActiveTab('bookmarks'); if(enableSfx) playClickSfx(); }} className={`text-sm font-serif transition-colors ${activeTab === 'bookmarks' ? 'text-[var(--text-main)] border-b border-[var(--accent)] pb-1' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>Favorites</button>
         </div>

         <div className="w-24"></div> 
      </header>

      <div className="flex-1 overflow-y-auto pt-24 scroll-smooth">
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
      
      {editingBookId && books.find(b => b.id === editingBookId) && (
          <EditBookModal book={books.find(b => b.id === editingBookId)!} isOpen={true} onClose={() => setEditingBookId(null)} onSave={onUpdateBook} />
      )}
    </div>
  );
};
