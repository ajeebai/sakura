

import React, { useState, useEffect, useRef } from 'react';
import { 
    Palette, Layers, Grid, List, Sun, Zap, ArrowLeft, Search, 
    BookOpen, Sparkles, Heart, FolderHeart, 
    Book, Scroll, Bookmark, Moon, Eye, Monitor, Cloud, ArrowRight, MoveHorizontal, ArrowUp
} from 'lucide-react';
import { Theme, ReaderSettings, LibraryViewMode, ViewState } from '../types';
import { playClickSfx, playHoverSfx } from '../services/audio';

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

const SakuraIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="currentColor">
    <path d="M50 35 C40 10, 10 30, 20 50 C10 70, 40 90, 50 65 C60 90, 90 70, 80 50 C90 30, 60 10, 50 35 Z" />
  </svg>
);

export const RadialMenu: React.FC<RadialMenuProps> = ({
    currentView,
    currentTheme, onThemeChange,
    settings, onSettingChange,
    viewMode, onViewModeChange,
    onSearch, onBack,
    activeBookId, onToggleFavorite, onAddToCuration,
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
        const themes: Theme[] = ['zen-dark', 'zen-light'];
        const textures = ['none', 'washi', 'halftone'];

        const lightingMenu: MenuItem = {
            id: 'lighting',
            icon: settings.lightingMode === 'spotlight' ? <Zap className="w-5 h-5" strokeWidth={1} /> : <Sun className="w-5 h-5" strokeWidth={1} />,
            label: `Light: ${settings.lightingMode}`,
            action: () => {}, // Submenu trigger
            submenu: [
                { id: 'l-ambient', icon: <Sun className="w-5 h-5" strokeWidth={1}/>, label: 'Ambient', action: () => onSettingChange('lightingMode', 'ambient') },
                { id: 'l-spotlight', icon: <Zap className="w-5 h-5" strokeWidth={1}/>, label: 'Spotlight', action: () => onSettingChange('lightingMode', 'spotlight') },
                { id: 'l-immersive', icon: <Eye className="w-5 h-5" strokeWidth={1}/>, label: 'Immersive', action: () => onSettingChange('lightingMode', 'immersive') },
                { id: 'l-dim', icon: <Moon className="w-5 h-5" strokeWidth={1}/>, label: 'Dim', action: () => onSettingChange('lightingMode', 'dim') },
                { id: 'l-dream', icon: <Cloud className="w-5 h-5" strokeWidth={1}/>, label: 'Dream', action: () => onSettingChange('lightingMode', 'dream') },
            ]
        };

        const commonItems: MenuItem[] = [
             {
                id: 'theme',
                icon: <Palette className="w-5 h-5" strokeWidth={1} />,
                label: `Theme: ${currentTheme}`,
                action: () => onThemeChange(themes[(themes.indexOf(currentTheme) + 1) % themes.length])
            },
            {
                id: 'texture',
                icon: <Layers className="w-5 h-5" strokeWidth={1} />,
                label: `Texture: ${settings.textureMode}`,
                action: () => {
                    const next = textures[(textures.indexOf(settings.textureMode) + 1) % textures.length];
                    onSettingChange('textureMode', next);
                }
            },
            lightingMenu
        ];

        // 1. Book Context (Right clicked on a book in library)
        if (contextData?.bookId && currentView === 'LIBRARY') {
            return [
                {
                    id: 'favorite',
                    icon: <Heart className="w-5 h-5" strokeWidth={1} />,
                    label: 'Favorite',
                    action: () => onToggleFavorite && onToggleFavorite(contextData.bookId)
                },
                {
                    id: 'curate',
                    icon: <FolderHeart className="w-5 h-5" strokeWidth={1} />,
                    label: 'Add to Curation',
                    action: () => onAddToCuration && onAddToCuration(contextData.bookId)
                },
                ...commonItems
            ];
        }

        // 2. Reader Context
        if (currentView === 'READER') {
             const items: MenuItem[] = [
                 {
                     id: 'back',
                     icon: <ArrowLeft className="w-5 h-5" strokeWidth={1} />,
                     label: 'Library',
                     action: onBack
                 },
                 {
                     id: 'bookmark',
                     icon: <Bookmark className={`w-5 h-5 ${isPageBookmarked ? 'fill-current text-white' : ''}`} strokeWidth={1} />,
                     label: isPageBookmarked ? 'Unmark' : 'Bookmark',
                     action: () => onTogglePageBookmark && onTogglePageBookmark()
                 },
                 {
                    id: 'reader-mode',
                    icon: settings.viewMode === 'vertical' || settings.viewMode === 'seamless' ? <Scroll className="w-5 h-5" strokeWidth={1}/> : <BookOpen className="w-5 h-5" strokeWidth={1}/>,
                    label: `View: ${settings.viewMode}`,
                    action: () => {}, // Submenu trigger
                    submenu: [
                        { id: 'm-single', icon: <Book className="w-5 h-5" strokeWidth={1}/>, label: 'Single', action: () => onSettingChange('viewMode', 'single') },
                        { id: 'm-spread', icon: <BookOpen className="w-5 h-5" strokeWidth={1}/>, label: 'Spread', action: () => onSettingChange('viewMode', 'spread') },
                        { id: 'm-vert', icon: <Scroll className="w-5 h-5" strokeWidth={1}/>, label: 'Vertical', action: () => onSettingChange('viewMode', 'vertical') },
                        { id: 'm-seamless', icon: <ArrowUp className="w-5 h-5" strokeWidth={1}/>, label: 'Seamless', action: () => onSettingChange('viewMode', 'seamless') },
                        { id: 'm-grid', icon: <Grid className="w-5 h-5" strokeWidth={1}/>, label: 'Grid', action: () => onSettingChange('viewMode', 'grid') },
                    ]
                 },
                 {
                    id: 'direction',
                    icon: settings.direction === 'LTR' ? <ArrowRight className="w-5 h-5" strokeWidth={1} /> : <ArrowLeft className="w-5 h-5" strokeWidth={1} />,
                    label: settings.direction,
                    action: () => onSettingChange('direction', settings.direction === 'LTR' ? 'RTL' : 'LTR')
                 },
                 lightingMenu,
                 ...commonItems.filter(i => i.id !== 'lighting')
             ];

             // Only show transitions if NOT vertical/grid/seamless
             if (settings.viewMode === 'single' || settings.viewMode === 'spread') {
                 items.splice(3, 0, {
                     id: 'transition',
                     icon: <Sparkles className="w-5 h-5" strokeWidth={1} />,
                     label: `FX: ${settings.transitionMode}`,
                     action: () => onSettingChange('transitionMode', ['none', 'snap', 'smooth', 'fade'][(['none', 'snap', 'smooth', 'fade'].indexOf(settings.transitionMode) + 1) % 4])
                 });
             }
             return items;
        }

        // 3. Global / Library Empty Space
        return [
            {
                id: 'search',
                icon: <Search className="w-5 h-5" strokeWidth={1} />,
                label: 'Search',
                action: onSearch
            },
            {
                id: 'view',
                icon: viewMode === 'grid' ? <Grid className="w-5 h-5" strokeWidth={1} /> : <List className="w-5 h-5" strokeWidth={1} />,
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
            {/* Center Hub - Glass Pill */}
            <button
                onClick={handleCenterClick}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-16 h-16 glass-panel rounded-full flex items-center justify-center z-20 hover:scale-105 transition-transform group text-[var(--text-main)]"
            >
                {menuStack.length > 0 ? (
                    <ArrowLeft className="w-6 h-6" strokeWidth={1} />
                ) : (
                    <SakuraIcon className="w-8 h-8" />
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
                        className="absolute w-12 h-12 glass-card rounded-full flex items-center justify-center hover:bg-[var(--text-main)] hover:text-[var(--bg-main)] hover:scale-110 transition-all duration-300 group z-10"
                        style={{
                            transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
                        }}
                    >
                        {item.icon}
                        
                        {/* Floating Tooltip */}
                        <span className="absolute top-full mt-4 text-[10px] font-medium tracking-widest uppercase glass-panel text-[var(--text-main)] px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-30">
                            {item.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
