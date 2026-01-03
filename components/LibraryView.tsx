import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Book, LibraryViewMode, SortOption } from '../types';
import { generateThumbnail } from '../utils/imageUtils';
import { dbUpdateBook, dbGetFavoriteFolders, dbToggleFavoriteFolder } from '../services/db';
import { Search, BookOpen, Heart, MoreHorizontal, ChevronLeft, ChevronRight, LayoutGrid, List, ArrowDownAZ, Calendar, Clock, Play, History, Shuffle, Folder, Home, Star } from 'lucide-react';
import { EditBookModal } from './EditBookModal';
import { naturalSort } from '../utils/fileUtils';

interface LibraryViewProps {
  books: Book[];
  onSelectBook: (bookId: string) => void;
  onUpdateBook: (bookId: string, changes: Partial<Book>) => void;
}

// --- Book Card ---
const BookCard: React.FC<{ 
    book: Book; 
    onClick: () => void;
    onToggleFavorite: (e: React.MouseEvent) => void;
    onEdit: (e: React.MouseEvent) => void;
    width?: number | string;
    height?: number | string;
    className?: string;
    priority?: boolean;
    showProgress?: boolean;
}> = React.memo(({ book, onClick, onToggleFavorite, onEdit, width, height, className, priority, showProgress = true }) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let active = true;

    const loadCover = async () => {
      if (book.coverImage) {
        const url = URL.createObjectURL(book.coverImage);
        if (active) setCoverUrl(url);
        return; 
      }

      if (book.coverHandle) {
        try {
            const file = await book.coverHandle.getFile();
            if (file.size < 20 * 1024 * 1024) {
                 const thumbnailBlob = await generateThumbnail(file);
                 await dbUpdateBook({
                    ...book,
                    coverImage: thumbnailBlob,
                    handle: undefined, pages: undefined, coverHandle: undefined, readingProgress: undefined 
                } as any);
                
                const url = URL.createObjectURL(thumbnailBlob);
                if (active) setCoverUrl(url);
            }
        } catch (e) { /* silent */ }
      }
    };
    loadCover();
    return () => { 
        active = false;
        if (coverUrl) URL.revokeObjectURL(coverUrl);
    };
  }, [book.id, book.coverImage, book.coverHandle]); 

  const progress = book.readingProgress;
  const percentage = progress?.percentage || 0;
  const isCompleted = progress?.status === 'completed';

  return (
    <div 
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative flex-shrink-0 cursor-pointer transition-all duration-500 snap-center ${book.isHidden ? 'opacity-40' : 'opacity-100'} ${className || ''}`}
      style={{ width, height }}
    >
      <div 
        className="relative w-full h-full rounded-md overflow-hidden bg-[var(--bg-card)] transition-transform duration-500 ease-out-expo border border-[var(--border-color)] aspect-[2/3]"
        style={{
            transform: isHovered ? 'scale(1.05)' : 'scale(1)',
            zIndex: isHovered ? 10 : 1,
            boxShadow: isHovered ? 'var(--shadow-elevation)' : 'none'
        }}
      >
        {coverUrl ? (
          <img 
            src={coverUrl} 
            alt={book.title} 
            className={`w-full h-full object-cover transition-all duration-700 ${isCompleted ? 'grayscale opacity-70' : 'grayscale-[0.1]'}`}
            loading={priority ? "eager" : "lazy"}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] p-4 text-center bg-[var(--bg-card)]">
            <BookOpen className="w-8 h-8 mb-2 opacity-30" />
            <span className="text-[10px] tracking-[0.2em] uppercase font-serif opacity-50 truncate w-full">
                {book.format === 'pdf' ? 'PDF' : book.format === 'archive' ? 'ARCHIVE' : 'BOOK'}
            </span>
          </div>
        )}

        {/* Ambient Overlay on Hover */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent transition-opacity duration-500 ${isHovered ? 'opacity-100' : 'opacity-0'}`} />
        
        {/* Floating Actions */}
        <div className={`absolute top-2 right-2 flex items-center gap-1 transition-all duration-300 z-20 ${isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
            <button 
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(e); }}
                className={`p-1.5 rounded-full backdrop-blur-md transition-colors ${book.isFavorite ? 'bg-[var(--accent)] text-white' : 'bg-black/40 text-white hover:bg-[var(--accent)]'}`}
            >
                <Heart className={`w-3 h-3 ${book.isFavorite ? 'fill-current' : ''}`} />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onEdit(e); }}
                className="p-1.5 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-white hover:text-black transition-colors"
            >
                <MoreHorizontal className="w-3 h-3" />
            </button>
        </div>

        {/* Progress Bar */}
        {showProgress && percentage > 0 && !isCompleted && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                <div 
                    className="h-full bg-[var(--accent)]" 
                    style={{ width: `${percentage}%` }}
                />
            </div>
        )}

        {/* Title Overlay (Only on hover) */}
        <div className={`absolute bottom-0 left-0 right-0 p-3 transform transition-all duration-500 ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
            <h3 className="text-white font-medium text-xs leading-tight line-clamp-2">
                {book.title}
            </h3>
        </div>
      </div>
    </div>
  );
});

// --- Cinematic Hero Section ---
const HeroSection: React.FC<{ book: Book; onRead: () => void; onShuffle: () => void }> = ({ book, onRead, onShuffle }) => {
    const [coverUrl, setCoverUrl] = useState<string | null>(null);

    useEffect(() => {
        if (book.coverImage) {
            setCoverUrl(URL.createObjectURL(book.coverImage));
        } else if (book.coverHandle) {
             book.coverHandle.getFile().then(f => generateThumbnail(f, 600)).then(blob => {
                 setCoverUrl(URL.createObjectURL(blob));
             }).catch(() => {});
        }
    }, [book]);

    if (!book) return null;

    return (
        <div className="relative w-full h-[60vh] min-h-[400px] overflow-hidden group mb-4">
            {/* Background Blur */}
            <div className="absolute inset-0 w-full h-full">
                {coverUrl && (
                    <img 
                        src={coverUrl} 
                        className="w-full h-full object-cover opacity-30 blur-3xl scale-110" 
                        alt="Background"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-main)] via-[var(--bg-main)]/50 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-main)] via-transparent to-transparent" />
            </div>

            {/* Content */}
            <div className="absolute inset-0 flex items-end pb-12 px-8 md:px-16 z-10">
                <div className="flex flex-col md:flex-row items-end md:items-end gap-8 w-full max-w-7xl mx-auto">
                    
                    {/* Featured Cover */}
                    <div 
                        className="hidden md:block flex-shrink-0 w-48 aspect-[2/3] rounded-lg shadow-2xl overflow-hidden border border-[var(--border-color)] transform transition-transform group-hover:scale-105 duration-700 cursor-pointer"
                        onClick={onRead}
                    >
                         {coverUrl ? <img src={coverUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-black/50" />}
                    </div>

                    {/* Text Info */}
                    <div className="flex-1 space-y-4 mb-2">
                        <div className="flex items-center space-x-2 mb-2">
                            {book.category && (
                                <span className="px-2 py-1 bg-white/10 backdrop-blur-md rounded text-[10px] uppercase tracking-widest font-bold text-[var(--accent)] border border-white/10">
                                    {book.category}
                                </span>
                            )}
                            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Featured</span>
                        </div>
                        
                        <h1 className="text-4xl md:text-6xl font-serif font-bold text-[var(--text-main)] leading-tight drop-shadow-lg line-clamp-2">
                            {book.title}
                        </h1>
                        
                        <p className="max-w-xl text-[var(--text-muted)] line-clamp-3 md:line-clamp-2 text-sm md:text-base leading-relaxed">
                            Dive back into your collection. {book.pageCount > 0 ? `${book.pageCount} pages.` : ''} 
                            {book.readingProgress?.percentage ? ` You are ${book.readingProgress.percentage}% through.` : ' Start reading now.'}
                        </p>

                        <div className="pt-4 flex items-center gap-4">
                            <button 
                                onClick={onRead}
                                className="flex items-center gap-2 px-8 py-3 bg-[var(--text-main)] text-[var(--bg-main)] rounded-lg font-bold hover:bg-[var(--accent)] hover:text-white transition-all shadow-lg hover:shadow-[var(--accent)]/30"
                            >
                                <Play className="w-5 h-5 fill-current" />
                                {book.readingProgress?.percentage ? 'Continue Reading' : 'Read Now'}
                            </button>

                            <button
                                onClick={onShuffle}
                                title="Surprise Me (Shuffle)"
                                className="p-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-lg hover:bg-[var(--accent)] hover:border-[var(--accent)] transition-all text-white"
                            >
                                <Shuffle className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Category Row ---
const CategoryRow: React.FC<{
    title: string;
    path: string;
    books: Book[];
    onSelectBook: (id: string) => void;
    onToggleFavorite: (id: string, val: boolean) => void;
    onEdit: (id: string) => void;
    onTitleClick?: () => void;
    icon?: React.ReactNode;
    isFavoriteFolder?: boolean;
    onToggleFolderFavorite?: () => void;
}> = ({ title, path, books, onSelectBook, onToggleFavorite, onEdit, onTitleClick, icon, isFavoriteFolder, onToggleFolderFavorite }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const container = scrollRef.current;
            const scrollAmount = container.clientWidth * 0.8; 
            const target = direction === 'left' 
                ? container.scrollLeft - scrollAmount 
                : container.scrollLeft + scrollAmount;
            
            container.scrollTo({ left: target, behavior: 'smooth' });
        }
    };

    return (
        <div className="mb-10 md:mb-14 group/row relative">
            <div 
                className={`px-8 md:px-12 flex items-center gap-2 mb-4 group/title`}
            >
                <div onClick={onTitleClick} className={`flex items-center gap-2 ${onTitleClick ? 'cursor-pointer' : ''}`}>
                    {icon}
                    <h2 className="text-lg md:text-xl font-medium text-[var(--text-main)] group-hover/title:text-[var(--accent)] transition-colors flex items-center gap-2">
                        {title}
                        {onTitleClick && <ChevronRight className="w-4 h-4 opacity-0 group-hover/title:opacity-100 -translate-x-2 group-hover/title:translate-x-0 transition-all text-[var(--accent)]" />}
                    </h2>
                    <span className="text-xs font-sans text-[var(--text-muted)] opacity-50 uppercase tracking-widest translate-y-[1px]">
                        {books.length}
                    </span>
                </div>

                {onToggleFolderFavorite && (
                    <button 
                        onClick={onToggleFolderFavorite} 
                        className={`ml-4 p-1.5 rounded-full border transition-all ${isFavoriteFolder ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]'}`}
                        title={isFavoriteFolder ? "Remove from Favorite Folders" : "Add to Favorite Folders"}
                    >
                        <Star className={`w-3 h-3 ${isFavoriteFolder ? 'fill-current' : ''}`} />
                    </button>
                )}
            </div>
            
            <div className="relative group">
                <button 
                    onClick={() => scroll('left')}
                    className="absolute left-0 top-0 bottom-0 w-12 md:w-16 bg-gradient-to-r from-[var(--bg-main)] to-transparent z-20 flex items-center justify-start pl-2 md:pl-4 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 hover:from-black/80"
                >
                    <ChevronLeft className="w-8 h-8 text-white drop-shadow-lg" />
                </button>

                <div 
                    ref={scrollRef}
                    className="flex overflow-x-auto gap-4 md:gap-6 px-8 md:px-12 pb-8 snap-x-mandatory scrollbar-hide pt-2"
                    style={{ scrollBehavior: 'smooth' }}
                >
                    {books.map(book => (
                        <BookCard
                            key={book.id}
                            book={book}
                            width={170} 
                            height={255}
                            className="transform transition-transform duration-300 hover:-translate-y-2"
                            onClick={() => onSelectBook(book.id)}
                            onToggleFavorite={(e) => onToggleFavorite(book.id, !book.isFavorite)}
                            onEdit={(e) => onEdit(book.id)}
                        />
                    ))}
                    <div className="w-12 flex-shrink-0" />
                </div>

                <button 
                    onClick={() => scroll('right')}
                    className="absolute right-0 top-0 bottom-0 w-12 md:w-16 bg-gradient-to-l from-[var(--bg-main)] to-transparent z-20 flex items-center justify-end pr-2 md:pr-4 opacity-0 group-hover:opacity-100 transition-opacity hover:from-black/80"
                >
                    <ChevronRight className="w-8 h-8 text-white drop-shadow-lg" />
                </button>
            </div>
        </div>
    );
};

export const LibraryView: React.FC<LibraryViewProps> = ({ books, onSelectBook, onUpdateBook }) => {
  const [search, setSearch] = useState('');
  const [showHeader, setShowHeader] = useState(true);
  const [viewMode, setViewMode] = useState<LibraryViewMode>('category');
  const [sortOption, setSortOption] = useState<SortOption>('title');
  const [currentPath, setCurrentPath] = useState<string>(''); // For folder navigation
  
  // Favorites State
  const [favoriteFolders, setFavoriteFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
      dbGetFavoriteFolders().then(folders => setFavoriteFolders(new Set(folders)));
  }, []);

  const toggleFolderFav = async (path: string) => {
      const newFavs = await dbToggleFavoriteFolder(path);
      setFavoriteFolders(new Set(newFavs));
  };
  
  const lastScrollY = useRef(0);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const currentScrollY = e.currentTarget.scrollTop;
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
          setShowHeader(false);
      } else {
          setShowHeader(true);
      }
      lastScrollY.current = currentScrollY;
  };

  const sortedBooks = useMemo(() => {
    let filtered = books.filter(b => {
        const matchesSearch = b.title.toLowerCase().includes(search.toLowerCase());
        const isVisible = !b.isHidden; 
        return matchesSearch && isVisible;
    });

    return filtered.sort((a, b) => {
        switch (sortOption) {
            case 'added': return b.addedAt - a.addedAt;
            case 'recent': return (b.lastReadAt || 0) - (a.lastReadAt || 0);
            case 'title': default: return naturalSort(a.title, b.title);
        }
    });
  }, [books, search, sortOption]);

  // --- Grouping Logic for Deep Navigation ---
  const { categorizedGroups, currentFolderBooks, favorites, continueReading } = useMemo(() => {
    // 1. Global Lists (for Home screen)
    const favs = sortedBooks.filter(b => b.isFavorite);
    const reading = sortedBooks.filter(b => b.readingProgress?.status === 'in_progress').sort((a,b) => (b.lastReadAt||0) - (a.lastReadAt||0));
    
    // 2. Folder Navigation Logic
    const groups: Record<string, Book[]> = {};
    const flatBooks: Book[] = [];
    
    sortedBooks.forEach(book => {
        // Only consider books inside currentPath
        if (!book.path.startsWith(currentPath)) return;
        
        // Relativize path. 
        // If currentPath is "", path "Manga/Naruto" -> "Manga/Naruto"
        let relativePath = book.path;
        if (currentPath) {
            // Add slash to ensure we match directory boundary
            const prefix = currentPath + '/';
            if (!book.path.startsWith(prefix)) return; 
            relativePath = book.path.substring(prefix.length);
        }

        const parts = relativePath.split('/');
        
        if (parts.length === 1) {
            // It's a book directly in this folder
            flatBooks.push(book);
        } else {
            // It's in a subfolder
            const subFolderName = parts[0];
            if (!groups[subFolderName]) groups[subFolderName] = [];
            groups[subFolderName].push(book);
        }
    });

    const sortedGroupKeys = Object.keys(groups).sort(naturalSort);
    const resultGroups = sortedGroupKeys.map(key => ({ 
        title: key.replace(/[_-]/g, ' '), 
        originalPath: currentPath ? `${currentPath}/${key}` : key, // Keep FULL path for navigation
        books: groups[key] 
    }));

    // Prioritize Favorite Folders to top of list
    resultGroups.sort((a, b) => {
        const aFav = favoriteFolders.has(a.originalPath);
        const bFav = favoriteFolders.has(b.originalPath);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return 0;
    });

    return { 
        categorizedGroups: resultGroups, 
        currentFolderBooks: flatBooks,
        favorites: favs,
        continueReading: reading
    };
  }, [sortedBooks, currentPath, favoriteFolders]);

  // Featured Book (only from current view scope)
  const featuredBook = useMemo(() => {
      // If we are deep in folders, maybe pick one from here
      const pool = currentFolderBooks.length > 0 ? currentFolderBooks : 
                   categorizedGroups.length > 0 ? categorizedGroups[0].books : [];
      
      if (pool.length === 0) return null;
      return pool.find(b => b.isFavorite) || pool[0];
  }, [currentFolderBooks, categorizedGroups]);

  const navigateToFolder = (folderName: string) => {
      // folderName here is the FULL path constructed above
      setCurrentPath(folderName);
      setViewMode('category'); 
  };

  const navigateUp = () => {
      if (!currentPath) return;
      const parts = currentPath.split('/');
      parts.pop();
      setCurrentPath(parts.join('/'));
  };

  const navigateToBreadcrumb = (index: number) => {
      if (index === -1) setCurrentPath('');
      else {
          const parts = currentPath.split('/');
          setCurrentPath(parts.slice(0, index + 1).join('/'));
      }
  };

  const handleShuffle = () => {
      // Shuffle from *visible* books in current scope
      const scopeBooks = [...currentFolderBooks, ...categorizedGroups.flatMap(g => g.books)];
      if (scopeBooks.length === 0) return;
      const randomBook = scopeBooks[Math.floor(Math.random() * scopeBooks.length)];
      onSelectBook(randomBook.id);
  };

  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const activeBook = books.find(b => b.id === editingBookId);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)] transition-colors duration-700 relative">
      
      {/* Header */}
      <header 
        className={`absolute top-0 left-0 right-0 z-30 px-8 py-6 flex flex-col md:flex-row items-start md:items-center justify-between transition-transform duration-500 ease-out-expo ${showHeader ? 'translate-y-0' : '-translate-y-full'} bg-gradient-to-b from-[var(--bg-main)] to-transparent pointer-events-auto`}
      >
         {/* Breadcrumbs / Search */}
         <div className="flex flex-col gap-4 w-full max-w-xl">
            {/* Search */}
            <div className="relative group w-full transition-opacity duration-300">
                <div className={`absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-md rounded-full border border-[var(--border-color)] shadow-sm transition-all duration-300 ${search ? 'ring-1 ring-[var(--accent)]' : ''}`} />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] z-10" />
                <input 
                    type="text"
                    placeholder="Search collection..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="relative z-10 w-full bg-transparent border-none rounded-full py-2.5 pl-12 pr-4 text-sm text-[var(--text-main)] focus:outline-none placeholder:text-[var(--text-muted)] font-serif tracking-wide"
                />
            </div>

            {/* Breadcrumbs */}
            {!search && currentPath && (
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] overflow-x-auto scrollbar-hide">
                    <button onClick={() => navigateToBreadcrumb(-1)} className="hover:text-[var(--accent)] transition-colors flex items-center gap-1">
                        <Home className="w-3 h-3" /> Home
                    </button>
                    {currentPath.split('/').map((part, idx) => (
                        <React.Fragment key={idx}>
                            <ChevronRight className="w-3 h-3 opacity-50" />
                            <button 
                                onClick={() => navigateToBreadcrumb(idx)} 
                                className={`hover:text-[var(--accent)] transition-colors whitespace-nowrap ${idx === currentPath.split('/').length - 1 ? 'text-[var(--text-main)] font-medium' : ''}`}
                            >
                                {part.replace(/[_-]/g, ' ')}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            )}
         </div>

         {/* View Controls */}
         <div className="mt-4 md:mt-0 flex items-center space-x-2 bg-[var(--bg-overlay)] backdrop-blur-md p-1 rounded-xl border border-[var(--border-color)] shadow-xl">
             <div className="flex items-center space-x-1 px-2 border-r border-[var(--border-color)]">
                 <button onClick={() => setSortOption('title')} className={`p-1.5 rounded-lg ${sortOption === 'title' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><ArrowDownAZ className="w-4 h-4" /></button>
                 <button onClick={() => setSortOption('added')} className={`p-1.5 rounded-lg ${sortOption === 'added' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><Calendar className="w-4 h-4" /></button>
             </div>
             <div className="flex items-center space-x-1 px-1">
                <button onClick={() => setViewMode('category')} className={`p-1.5 rounded-lg ${viewMode === 'category' ? 'bg-[var(--bg-card)] text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><List className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg ${viewMode === 'grid' ? 'bg-[var(--bg-card)] text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><LayoutGrid className="w-4 h-4" /></button>
             </div>
         </div>
      </header>

      {/* Main Content */}
      <div onScroll={handleScroll} className="flex-1 overflow-y-auto pb-20 scroll-smooth">
          
          {sortedBooks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] opacity-50 pt-32">
                 <BookOpen className="w-12 h-12 mb-4 font-thin opacity-50" />
                 <p className="font-serif italic text-xl">The collection is empty.</p>
              </div>
          ) : viewMode === 'category' && !search ? (
              <div className="flex flex-col pb-20">
                  
                  {/* Hero (Only at Root) */}
                  {!currentPath && featuredBook && (
                      <HeroSection book={featuredBook} onRead={() => onSelectBook(featuredBook.id)} onShuffle={handleShuffle} />
                  )}

                  {/* Spacer or Back Button Area */}
                  <div className={`${!currentPath && featuredBook ? '' : 'pt-32'} px-8 mb-8`}>
                      {currentPath && (
                          <div className="flex items-center gap-4 mb-8">
                             <button onClick={navigateUp} className="p-2 rounded-full border border-[var(--border-color)] hover:bg-[var(--bg-card)] transition-colors group">
                                 <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
                             </button>
                             <h1 className="text-3xl font-serif font-bold">{currentPath.split('/').pop()?.replace(/[_-]/g, ' ')}</h1>
                          </div>
                      )}
                  </div>

                  {/* Special Rows (Only at Root) */}
                  {!currentPath && (
                      <>
                        {continueReading.length > 0 && (
                            <CategoryRow title="Jump Back In" path="continue" books={continueReading} onSelectBook={onSelectBook} onToggleFavorite={(id, val) => onUpdateBook(id, { isFavorite: val })} onEdit={(id) => setEditingBookId(id)} icon={<History className="w-5 h-5 text-[var(--accent)]" />} />
                        )}
                        {favorites.length > 0 && (
                            <CategoryRow title="Your Favorites" path="favorites" books={favorites} onSelectBook={onSelectBook} onToggleFavorite={(id, val) => onUpdateBook(id, { isFavorite: val })} onEdit={(id) => setEditingBookId(id)} icon={<Heart className="w-5 h-5 text-rose-500 fill-current" />} />
                        )}
                      </>
                  )}

                  {/* Sub-Folders as Rows */}
                  {categorizedGroups.map((group) => (
                      <CategoryRow 
                          key={group.originalPath}
                          title={group.title}
                          path={group.originalPath}
                          books={group.books}
                          onSelectBook={onSelectBook}
                          onToggleFavorite={(id, val) => onUpdateBook(id, { isFavorite: val })}
                          onEdit={(id) => setEditingBookId(id)}
                          onTitleClick={() => navigateToFolder(group.originalPath)}
                          icon={<Folder className={`w-5 h-5 ${favoriteFolders.has(group.originalPath) ? 'text-[var(--accent)] fill-current' : 'text-[var(--text-muted)] fill-current opacity-50'}`} />}
                          isFavoriteFolder={favoriteFolders.has(group.originalPath)}
                          onToggleFolderFavorite={() => toggleFolderFav(group.originalPath)}
                      />
                  ))}

                  {/* Loose Books in this Folder (Grid style at bottom) */}
                  {currentFolderBooks.length > 0 && (
                      <div className="px-8 md:px-12 mt-8">
                          <h2 className="text-lg md:text-xl font-medium text-[var(--text-main)] mb-6 flex items-center gap-2">
                              <BookOpen className="w-5 h-5 text-[var(--text-muted)]" />
                              Books in this folder
                          </h2>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                              {currentFolderBooks.map(book => (
                                  <div key={book.id} className="flex flex-col items-center group">
                                      <BookCard book={book} width="100%" height="auto" onClick={() => onSelectBook(book.id)} onToggleFavorite={(e) => onUpdateBook(book.id, { isFavorite: !book.isFavorite })} onEdit={(e) => setEditingBookId(book.id)} className="w-full transform transition-transform group-hover:-translate-y-2 duration-300" />
                                      <p className="mt-3 text-xs text-[var(--text-muted)] group-hover:text-[var(--text-main)] text-center line-clamp-2">{book.title}</p>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
          ) : (
              // Grid View (Flat List of visible scope)
              <div className="pt-32 px-8">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                      {(search ? sortedBooks : [...currentFolderBooks, ...categorizedGroups.flatMap(g => g.books)]).map(book => (
                          <div key={book.id} className="flex flex-col items-center group">
                              <BookCard book={book} width="100%" height="auto" onClick={() => onSelectBook(book.id)} onToggleFavorite={(e) => onUpdateBook(book.id, { isFavorite: !book.isFavorite })} onEdit={(e) => setEditingBookId(book.id)} className="w-full transform transition-transform group-hover:-translate-y-2 duration-300" />
                              <p className="mt-3 text-xs text-[var(--text-muted)] group-hover:text-[var(--text-main)] text-center line-clamp-2 w-full max-w-[150px] transition-colors">{book.title}</p>
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>

      {activeBook && <EditBookModal book={activeBook} isOpen={!!activeBook} onClose={() => setEditingBookId(null)} onSave={onUpdateBook} />}
    </div>
  );
};