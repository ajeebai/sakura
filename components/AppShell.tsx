import React from 'react';
import { Library, Theme } from '../types';
import { LayoutGrid, Book, Palette, ArrowLeft } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  libraries: Library[];
  activeLibraryId: string | null;
  onSelectLibrary: (library: Library) => void;
  onGoHome: () => void;
  currentTheme: Theme;
  onToggleTheme: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  libraries,
  activeLibraryId,
  onSelectLibrary,
  onGoHome,
  currentTheme,
  onToggleTheme
}) => {
  
  return (
    <div className="flex h-screen w-full bg-[var(--bg-main)] overflow-hidden text-[var(--text-main)] font-sans">
      
      {/* Minimal Sidebar - Dock Style */}
      <aside className="w-16 md:w-20 flex-shrink-0 flex flex-col items-center py-8 border-r border-[var(--border-color)] bg-[var(--bg-main)] z-40 transition-all duration-300">
        
        {/* Brand Mark */}
        <div className="mb-10">
           <div className="w-8 h-8 rounded-full border border-[var(--text-main)] flex items-center justify-center">
             <span className="font-serif font-bold text-xs">S</span>
           </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col items-center space-y-6 w-full">
          
          <button 
             onClick={onGoHome}
             title="Home / Collections"
             className={`p-3 rounded-2xl transition-all duration-300 group ${!activeLibraryId ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
           >
             <LayoutGrid className="w-5 h-5" />
             <span className="absolute left-16 bg-[var(--bg-card)] px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-[var(--border-color)]">Collections</span>
           </button>

           <div className="w-8 h-px bg-[var(--border-color)]/50" />

           {libraries.map(lib => (
             <button
                key={lib.id}
                onClick={() => onSelectLibrary(lib)}
                className={`group relative p-3 rounded-2xl transition-all duration-300 ${lib.id === activeLibraryId ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
             >
                <Book className="w-5 h-5" />
                <span className="absolute left-16 bg-[var(--bg-card)] px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-[var(--border-color)] z-50">
                    {lib.name}
                </span>
                
                {/* Active Indicator Dot */}
                {lib.id === activeLibraryId && (
                    <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-1 bg-[var(--accent)] rounded-full" />
                )}
             </button>
           ))}

        </nav>

        {/* Theme Toggle */}
        <button 
          onClick={onToggleTheme}
          className="p-3 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors rounded-full hover:bg-[var(--bg-card)]"
          title="Toggle Theme"
        >
            <Palette className="w-5 h-5" />
        </button>

      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col bg-[var(--bg-main)]">
        {children}
      </main>
    </div>
  );
};
