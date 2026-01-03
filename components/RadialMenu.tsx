
import React, { useState, useEffect, useRef } from 'react';
import { Palette, Layers, Grid, List, CloudRain, Sun, Zap, ArrowLeft, Search, BookOpen, LayoutTemplate, Bookmark, Sparkles, Filter } from 'lucide-react';
import { Theme, ReaderSettings, LibraryViewMode, ViewState } from '../types';
import { playClickSfx, playHoverSfx } from '../services/audio';

interface RadialMenuProps {
  currentView: ViewState; 
  onBack?: () => void;
  onSearch?: () => void;
  currentTheme: Theme;
  onThemeChange: (t: Theme) => void;
  settings: ReaderSettings;
  onSettingChange: (k: keyof ReaderSettings, v: any) => void;
  viewMode: LibraryViewMode;
  onViewModeChange: (m: LibraryViewMode) => void;
}

interface MenuItem {
    id: string;
    icon: React.ReactNode;
    label: string;
    action: () => void;
}

export const RadialMenu: React.FC<RadialMenuProps> = ({
    currentView,
    onBack,
    onSearch,
    currentTheme, onThemeChange,
    settings, onSettingChange,
    viewMode, onViewModeChange
}) => {
    const [position, setPosition] = useState<{x: number, y: number} | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            const x = Math.min(e.clientX, window.innerWidth - 150);
            const y = Math.min(e.clientY, window.innerHeight - 150);
            setPosition({ x: Math.max(150, x), y: Math.max(150, y) });
            setIsVisible(true);
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

    if (!isVisible || !position) return null;

    // Theme Cycling
    const themes: Theme[] = ['sakura-night', 'ivory-paper', 'ink-blossom', 'cyber-grid', 'autumn-scroll', 'nordic-frost'];
    const textures = ['none', 'grain', 'halftone', 'fabric'];
    const libViews: LibraryViewMode[] = ['category', 'grid'];
    const readerViews = ['single', 'spread', 'vertical']; 
    const atmospheres = ['none', 'rain', 'vinyl'];
    const lighting = ['ambient', 'spotlight'];
    const transitions = ['none', 'slide', 'flip', 'datamosh'];

    const allItems: Record<string, MenuItem> = {
        back: {
            id: 'back',
            icon: <ArrowLeft className="w-5 h-5" />,
            label: 'Go Back',
            action: () => { if(onBack) onBack(); }
        },
        search: {
            id: 'search',
            icon: <Search className="w-5 h-5" />,
            label: 'Search',
            action: () => { if(onSearch) onSearch(); }
        },
        theme: { 
            id: 'theme', 
            icon: <Palette className="w-5 h-5" />, 
            label: `Theme: ${currentTheme.replace('-', ' ')}`, 
            action: () => onThemeChange(themes[(themes.indexOf(currentTheme) + 1) % themes.length])
        },
        libView: { 
            id: 'libView', 
            icon: viewMode === 'grid' ? <Grid className="w-5 h-5" /> : <List className="w-5 h-5" />, 
            label: `View: ${viewMode}`, 
            action: () => onViewModeChange(libViews[(libViews.indexOf(viewMode) + 1) % libViews.length])
        },
        readerView: {
            id: 'readerView',
            icon: settings.viewMode === 'spread' ? <BookOpen className="w-5 h-5" /> : settings.viewMode === 'vertical' ? <List className="w-5 h-5" /> : <LayoutTemplate className="w-5 h-5" />,
            label: `Mode: ${settings.viewMode}`,
            action: () => onSettingChange('viewMode', readerViews[(readerViews.indexOf(settings.viewMode) + 1) % readerViews.length])
        },
        texture: { 
            id: 'texture', 
            icon: <Layers className="w-5 h-5" />, 
            label: `Texture: ${settings.textureMode}`, 
            action: () => onSettingChange('textureMode', textures[(textures.indexOf(settings.textureMode) + 1) % textures.length])
        },
        atmosphere: {
            id: 'atmosphere',
            icon: <CloudRain className="w-5 h-5" />,
            label: `Sound: ${settings.atmosphere}`,
            action: () => onSettingChange('atmosphere', atmospheres[(atmospheres.indexOf(settings.atmosphere) + 1) % atmospheres.length])
        },
        lighting: {
            id: 'lighting',
            icon: settings.lightingMode === 'spotlight' ? <Zap className="w-5 h-5" /> : <Sun className="w-5 h-5" />,
            label: `Light: ${settings.lightingMode}`,
            action: () => onSettingChange('lightingMode', lighting[(lighting.indexOf(settings.lightingMode) + 1) % lighting.length])
        },
        transition: {
            id: 'transition',
            icon: <Sparkles className="w-5 h-5" />,
            label: `FX: ${settings.transitionMode}`,
            action: () => onSettingChange('transitionMode', transitions[(transitions.indexOf(settings.transitionMode) + 1) % transitions.length])
        },
        curation: {
            id: 'curation',
            icon: <Filter className="w-5 h-5" />,
            label: 'Curate',
            action: () => { alert("Curation Mode: Coming Soon"); /* Placeholder for future Curation Modal */ }
        }
    };

    let activeItems: MenuItem[] = [];

    if (currentView === 'READER') {
        activeItems = [
            allItems.back,
            allItems.transition,
            allItems.readerView,
            allItems.theme,
            allItems.atmosphere,
            allItems.texture
        ];
    } else if (currentView === 'LIBRARY') {
        activeItems = [
            allItems.search,
            allItems.back,
            allItems.theme,
            allItems.curation,
            allItems.texture,
            allItems.atmosphere
        ];
    } else {
        activeItems = [
            allItems.theme,
            allItems.texture
        ];
    }

    const radius = 90;
    const angleStep = (2 * Math.PI) / activeItems.length;

    return (
        <div 
            ref={menuRef}
            className="fixed z-[9999]" 
            style={{ left: position.x, top: position.y }}
        >
            <div className="absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-[var(--bg-main)] rounded-full border border-[var(--border-color)] shadow-2xl flex items-center justify-center z-20 pointer-events-none">
                <div className="w-2 h-2 bg-[var(--accent)] rounded-full animate-pulse" />
            </div>

            {activeItems.map((item, i) => {
                const angle = i * angleStep - Math.PI / 2;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                return (
                    <button
                        key={item.id}
                        onClick={(e) => {
                            e.stopPropagation();
                            item.action();
                            setIsVisible(false);
                            if(settings.enableSfx) playClickSfx();
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
