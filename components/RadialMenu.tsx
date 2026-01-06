
import React, { useState, useEffect, useRef } from 'react';
import { 
    Palette, Layers, Grid, List, CloudRain, Sun, Zap, ArrowLeft, Search, 
    BookOpen, LayoutTemplate, Sparkles, X, Heart, FolderHeart, Edit, 
    Book, Scroll, Bookmark
} from 'lucide-react';
import { Theme, ReaderSettings, LibraryViewMode, Playlist, Book as BookType, ViewState } from '../types';
import { playClickSfx, playHoverSfx } from '../services/audio';

// Context Definitions
type MenuContextType = 'GLOBAL' | 'BOOK' | 'READER';

interface RadialMenuProps {
  currentView: ViewState;
  
  // Data
  currentTheme: Theme;
  settings: ReaderSettings;
  viewMode: LibraryViewMode;
  
  // Actions
  onThemeChange: (t: Theme) => void;
  onSettingChange: (k: keyof ReaderSettings, v: any) => void;
  onViewModeChange: (m: LibraryViewMode) => void;
  onSearch: () => void;
  onBack: () => void;
  
  // Context Actions
  activeBookId?: string | null;
  onToggleFavorite?: (bookId: string) => void;
  onAddToCuration?: (bookId: string) => void;
  onEditBook?: (bookId: string) => void;
  
  // Reader specific
  onTogglePageBookmark?: () => void;
  isPageBookmarked?: boolean;
}

interface MenuItem {
    id: string;
    icon: React.ReactNode;
    label: string;
    action: () => void;
    submenu?: MenuItem[];
}

export const RadialMenu: React.FC<RadialMenuProps> = ({
    currentView,
    currentTheme, onThemeChange,
    settings, onSettingChange,
    viewMode, onViewModeChange,
    onSearch, onBack,
    activeBookId, onToggleFavorite, onAddToCuration, onEditBook,
    onTogglePageBookmark, isPageBookmarked
}) => {
    const [position, setPosition] = useState<{x: number, y: number} | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [menuStack, setMenuStack] = useState<MenuItem[][]>([]);
    const [contextData, setContextData] = useState<any>(null); // To store bookId if right-clicked on a book
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            
            // Check if we clicked on a book card
            const bookCard = (e.target as HTMLElement).closest('[data-book-id]');
            let clickedBookId = null;
            if (bookCard) {
                clickedBookId = bookCard.getAttribute('data-book-id');
                setContextData({ bookId: clickedBookId });
            } else {
                setContextData(null);
            }

            const x = Math.min(e.clientX, window.innerWidth - 150);
            const y = Math.min(e.clientY, window.innerHeight - 150);
            
            setPosition({ x: Math.max(150, x), y: Math.max(150, y) });
            setIsVisible(true);
            
            // Reset stack on open
            setMenuStack([]); 
            
            if(settings.enableSfx) playClickSfx();
        };

        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsVisible(false);
            }
        };

        window.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('click', handleClick);
        return () => {
            window.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('click', handleClick);
        };
    }, [settings.enableSfx]);

    // Generate Menu Items based on context and stack
    const getActiveItems = (): MenuItem[] => {
        if (menuStack.length > 0) return menuStack[menuStack.length - 1];

        // Root Level Generation
        const themes: Theme[] = ['sakura-night', 'ivory-paper', 'ink-blossom', 'cyber-grid', 'autumn-scroll', 'nordic-frost'];
        const transitions = ['none', 'snap', 'smooth', 'fade'];

        const commonItems: MenuItem[] = [
             {
                id: 'theme',
                icon: <Palette className="w-5 h-5" />,
                label: 'Theme',
                action: () => onThemeChange(themes[(themes.indexOf(currentTheme) + 1) % themes.length])
            },
            {
                id: 'texture',
                icon: <Layers className="w-5 h-5" />,
                label: 'Texture',
                action: () => {
                    const modes = ['none', 'paper'];
                    onSettingChange('textureMode', modes[(modes.indexOf(settings.textureMode) + 1) % modes.length]);
                }
            }
        ];

        // 1. Book Context (Right clicked on a book in library)
        if (contextData?.bookId && currentView === 'LIBRARY') {
            return [
                {
                    id: 'favorite',
                    icon: <Heart className="w-5 h-5" />,
                    label: 'Favorite',
                    action: () => onToggleFavorite && onToggleFavorite(contextData.bookId)
                },
                {
                    id: 'curate',
                    icon: <FolderHeart className="w-5 h-5" />,
                    label: 'Add to Curation',
                    action: () => onAddToCuration && onAddToCuration(contextData.bookId)
                },
                {
                    id: 'edit',
                    icon: <Edit className="w-5 h-5" />,
                    label: 'Edit Info',
                    action: () => onEditBook && onEditBook(contextData.bookId)
                },
                ...commonItems
            ];
        }

        // 2. Reader Context
        if (currentView === 'READER') {
             const items: MenuItem[] = [
                 {
                     id: 'back',
                     icon: <ArrowLeft className="w-5 h-5" />,
                     label: 'Back to Library',
                     action: onBack
                 },
                 {
                     id: 'bookmark',
                     icon: <Bookmark className={`w-5 h-5 ${isPageBookmarked ? 'fill-current text-red-500' : ''}`} />,
                     label: isPageBookmarked ? 'Remove Bookmark' : 'Bookmark Page',
                     action: () => onTogglePageBookmark && onTogglePageBookmark()
                 },
                 {
                    id: 'reader-mode',
                    icon: settings.viewMode === 'vertical' ? <Scroll className="w-5 h-5"/> : <BookOpen className="w-5 h-5"/>,
                    label: `View: ${settings.viewMode}`,
                    action: () => {}, // Submenu trigger
                    submenu: [
                        { id: 'm-single', icon: <Book className="w-5 h-5"/>, label: 'Single Page', action: () => onSettingChange('viewMode', 'single') },
                        { id: 'm-spread', icon: <BookOpen className="w-5 h-5"/>, label: 'Spread View', action: () => onSettingChange('viewMode', 'spread') },
                        { id: 'm-vert', icon: <Scroll className="w-5 h-5"/>, label: 'Vertical Scroll', action: () => onSettingChange('viewMode', 'vertical') },
                        { id: 'm-grid', icon: <Grid className="w-5 h-5"/>, label: 'Grid View', action: () => onSettingChange('viewMode', 'grid') },
                    ]
                 },
                 {
                     id: 'lighting',
                     icon: settings.lightingMode === 'spotlight' ? <Zap className="w-5 h-5" /> : <Sun className="w-5 h-5" />,
                     label: settings.lightingMode,
                     action: () => onSettingChange('lightingMode', settings.lightingMode === 'ambient' ? 'spotlight' : 'ambient')
                 },
                 ...commonItems
             ];

             // Only show transitions if NOT vertical/grid
             if (settings.viewMode !== 'vertical' && settings.viewMode !== 'grid') {
                 items.splice(2, 0, {
                     id: 'transition',
                     icon: <Sparkles className="w-5 h-5" />,
                     label: `FX: ${settings.transitionMode}`,
                     action: () => onSettingChange('transitionMode', transitions[(transitions.indexOf(settings.transitionMode) + 1) % transitions.length])
                 });
             }
             return items;
        }

        // 3. Global / Library Empty Space
        return [
            {
                id: 'search',
                icon: <Search className="w-5 h-5" />,
                label: 'Search',
                action: onSearch
            },
            {
                id: 'view',
                icon: viewMode === 'grid' ? <Grid className="w-5 h-5" /> : <List className="w-5 h-5" />,
                label: viewMode,
                action: () => onViewModeChange(viewMode === 'grid' ? 'category' : 'grid')
            },
            ...commonItems
        ];
    };

    if (!isVisible || !position) return null;

    const activeItems = getActiveItems();
    const radius = 90;
    const angleStep = (2 * Math.PI) / activeItems.length;

    const handleAction = (item: MenuItem) => {
        if (settings.enableSfx) playClickSfx();
        
        if (item.submenu) {
            setMenuStack(prev => [...prev, item.submenu!]);
        } else {
            item.action();
            setIsVisible(false);
        }
    };

    const handleCenterClick = () => {
        if (menuStack.length > 0) {
            setMenuStack(prev => prev.slice(0, -1));
        } else {
            setIsVisible(false);
        }
        if(settings.enableSfx) playClickSfx();
    };

    return (
        <div 
            ref={menuRef}
            className="fixed z-[9999]" 
            style={{ left: position.x, top: position.y }}
        >
            {/* Center Hub */}
            <button
                onClick={handleCenterClick}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-[var(--bg-main)] rounded-full border border-[var(--border-color)] shadow-2xl flex items-center justify-center z-20 hover:scale-110 transition-transform group ring-1 ring-white/10"
            >
                {menuStack.length > 0 ? (
                    <ArrowLeft className="w-6 h-6 text-[var(--text-main)]" />
                ) : (
                    <div className="w-3 h-3 bg-[var(--accent)] rounded-full animate-pulse group-hover:bg-[var(--text-main)]" />
                )}
            </button>

            {/* Radial Items */}
            {activeItems.map((item, i) => {
                const angle = i * angleStep - Math.PI / 2;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                return (
                    <button
                        key={item.id}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAction(item);
                        }}
                        onMouseEnter={() => settings.enableSfx && playHoverSfx()}
                        className="absolute w-12 h-12 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-full shadow-lg flex items-center justify-center hover:bg-[var(--text-main)] hover:text-[var(--bg-main)] hover:scale-110 transition-all duration-300 group z-10 ring-1 ring-white/5"
                        style={{
                            transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
                        }}
                    >
                        {item.icon}
                        
                        {/* Glassmorphic Tooltip */}
                        <span className="absolute top-full mt-3 text-[10px] font-mono uppercase bg-[var(--bg-overlay)] backdrop-blur-md text-[var(--text-main)] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-[var(--border-color)] z-30 shadow-xl">
                            {item.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
