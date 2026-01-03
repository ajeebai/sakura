
import React, { useState, useEffect, useRef } from 'react';
import { 
    Palette, Stack, SquaresFour, List, CloudRain, Sun, Lightning, ArrowLeft, MagnifyingGlass, 
    BookOpen, Layout, BookmarkSimple, Sparkle, Heart, Plus, Pencil, 
    MusicNote, Check
} from '@phosphor-icons/react';
import { Theme, ReaderSettings, LibraryViewMode, MenuContext, Playlist, Book } from '../types';
import { playClickSfx, playHoverSfx } from '../services/audio';

interface RadialMenuProps {
  context: MenuContext | null;
  onClose: () => void;
  
  // Data
  currentTheme: Theme;
  settings: ReaderSettings;
  viewMode: LibraryViewMode;
  playlists: Playlist[];
  
  // Actions
  onThemeChange: (t: Theme) => void;
  onSettingChange: (k: keyof ReaderSettings, v: any) => void;
  onViewModeChange: (m: LibraryViewMode) => void;
  onSearch: () => void;
  onGoHome: () => void;
  
  // Book Actions
  onToggleFavorite: (bookId: string) => void;
  onAddToPlaylist: (playlistId: string, bookId: string) => void;
  onCreatePlaylist: () => void;
  onEditBook: (bookId: string) => void;
  
  // Reader Actions
  onTogglePageBookmark: () => void;
  isPageBookmarked?: boolean;
}

interface MenuItem {
    id: string;
    icon: React.ReactNode;
    label: string;
    action: () => void;
    submenu?: MenuItem[];
    active?: boolean;
}

export const RadialMenu: React.FC<RadialMenuProps> = ({
    context, onClose,
    currentTheme, onThemeChange,
    settings, onSettingChange,
    viewMode, onViewModeChange,
    playlists,
    onSearch, onGoHome,
    onToggleFavorite, onAddToPlaylist, onCreatePlaylist, onEditBook,
    onTogglePageBookmark, isPageBookmarked
}) => {
    const [menuStack, setMenuStack] = useState<MenuItem[][]>([]);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (context) {
            setMenuStack([generateRootItems()]);
        } else {
            setMenuStack([]);
        }
    }, [context]); 

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        if (context) window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, [context, onClose]);

    const handleAction = (item: MenuItem) => {
        if (settings.enableSfx) playClickSfx();
        
        if (item.submenu) {
            setMenuStack(prev => [...prev, item.submenu!]);
        } else {
            item.action();
            if (item.id !== 'back') onClose();
        }
    };

    const handleBack = () => {
        if (settings.enableSfx) playClickSfx();
        if (menuStack.length > 1) {
            setMenuStack(prev => prev.slice(0, -1));
        } else {
            onClose();
        }
    };

    const generateRootItems = (): MenuItem[] => {
        if (!context) return [];

        const themes: Theme[] = ['sakura-night', 'ivory-paper', 'ink-blossom', 'cyber-grid', 'autumn-scroll', 'nordic-frost'];
        const transitions = ['none', 'slide', 'flip', 'datamosh'];

        const themeItem: MenuItem = {
            id: 'theme',
            icon: <Palette className="w-5 h-5" />,
            label: 'Theme',
            action: () => onThemeChange(themes[(themes.indexOf(currentTheme) + 1) % themes.length])
        };

        const textureItem: MenuItem = {
            id: 'texture',
            icon: <Stack className="w-5 h-5" />,
            label: 'Texture',
            action: () => {
                const modes = ['none', 'grain', 'halftone', 'fabric'];
                onSettingChange('textureMode', modes[(modes.indexOf(settings.textureMode) + 1) % modes.length]);
            }
        };

        if (context.type === 'BOOK') {
            const book = context.data as Book;
            const playlistItems: MenuItem[] = playlists.map(pl => ({
                id: `pl-${pl.id}`,
                icon: pl.bookIds.includes(book.id) ? <Check className="w-5 h-5 text-green-500"/> : <List className="w-5 h-5"/>,
                label: pl.name,
                action: () => onAddToPlaylist(pl.id, book.id)
            }));
            
            playlistItems.push({
                id: 'new-playlist',
                icon: <Plus className="w-5 h-5"/>,
                label: 'New Playlist',
                action: onCreatePlaylist
            });

            return [
                {
                    id: 'favorite',
                    icon: <Heart weight={book.isFavorite ? "fill" : "regular"} className={`w-5 h-5 ${book.isFavorite ? 'text-red-500' : ''}`} />,
                    label: book.isFavorite ? 'Unfavorite' : 'Favorite',
                    action: () => onToggleFavorite(book.id)
                },
                {
                    id: 'curate',
                    icon: <MusicNote className="w-5 h-5" />,
                    label: 'Add to Playlist',
                    action: () => {},
                    submenu: playlistItems
                },
                {
                    id: 'edit',
                    icon: <Pencil className="w-5 h-5" />,
                    label: 'Edit Info',
                    action: () => onEditBook(book.id)
                },
                themeItem
            ];
        }

        if (context.type === 'READER') {
             return [
                 {
                     id: 'bookmark-page',
                     icon: <BookmarkSimple weight={isPageBookmarked ? "fill" : "regular"} className={`w-5 h-5 ${isPageBookmarked ? 'text-red-500' : ''}`} />,
                     label: isPageBookmarked ? 'Remove Bookmark' : 'Bookmark Page',
                     action: onTogglePageBookmark
                 },
                 {
                     id: 'transition',
                     icon: <Sparkle className="w-5 h-5" />,
                     label: `FX: ${settings.transitionMode}`,
                     action: () => onSettingChange('transitionMode', transitions[(transitions.indexOf(settings.transitionMode) + 1) % transitions.length])
                 },
                 {
                     id: 'lighting',
                     icon: settings.lightingMode === 'spotlight' ? <Lightning className="w-5 h-5" /> : <Sun className="w-5 h-5" />,
                     label: settings.lightingMode,
                     action: () => onSettingChange('lightingMode', settings.lightingMode === 'ambient' ? 'spotlight' : 'ambient')
                 },
                 {
                     id: 'atmosphere',
                     icon: <CloudRain className="w-5 h-5" />,
                     label: settings.atmosphere,
                     action: () => {
                         const atmo = ['none', 'rain', 'vinyl'];
                         onSettingChange('atmosphere', atmo[(atmo.indexOf(settings.atmosphere) + 1) % atmo.length]);
                     }
                 },
                 {
                     id: 'home',
                     icon: <ArrowLeft className="w-5 h-5" />,
                     label: 'Exit to Home',
                     action: onGoHome
                 }
             ];
        }

        return [
            {
                id: 'search',
                icon: <MagnifyingGlass className="w-5 h-5" />,
                label: 'Search',
                action: onSearch
            },
            {
                id: 'view',
                icon: viewMode === 'grid' ? <SquaresFour className="w-5 h-5" /> : <List className="w-5 h-5" />,
                label: viewMode,
                action: () => onViewModeChange(viewMode === 'grid' ? 'category' : 'grid')
            },
            themeItem,
            textureItem
        ];
    };

    if (!context || menuStack.length === 0) return null;

    const activeItems = menuStack[menuStack.length - 1];
    const radius = 90;
    const angleStep = (2 * Math.PI) / activeItems.length;

    return (
        <div 
            ref={menuRef}
            className="fixed z-[9999]" 
            style={{ left: context.x, top: context.y }}
        >
            <button
                onClick={handleBack}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-[var(--bg-main)] rounded-full border border-[var(--border-color)] shadow-2xl flex items-center justify-center z-20 hover:scale-110 transition-transform group"
            >
                {menuStack.length > 1 ? (
                    <ArrowLeft className="w-6 h-6 text-[var(--text-main)]" />
                ) : (
                    <div className="w-3 h-3 bg-[var(--accent)] rounded-full animate-pulse group-hover:bg-[var(--text-main)]" />
                )}
            </button>

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
                        className="absolute w-12 h-12 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-full shadow-lg flex items-center justify-center hover:bg-[var(--text-main)] hover:text-[var(--bg-main)] hover:scale-110 transition-all duration-300 group z-10"
                        style={{
                            transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
                        }}
                    >
                        {item.icon}
                        <span className="absolute top-full mt-3 text-[10px] font-mono uppercase bg-[var(--bg-overlay)] backdrop-blur text-[var(--text-main)] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-[var(--border-color)] z-30 shadow-xl">
                            {item.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
