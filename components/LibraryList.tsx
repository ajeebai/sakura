
import React from 'react';
import { Library } from '../types';
import { Plus, Trash2, Palette, Folder, Layers } from 'lucide-react';

interface LibraryListProps {
  libraries: Library[];
  onSelectLibrary: (lib: Library) => void;
  onAddLibrary: () => void;
  onDeleteLibrary: (id: string) => void;
  onToggleTheme: () => void;
}

export const LibraryList: React.FC<LibraryListProps> = ({ 
  libraries, 
  onSelectLibrary, 
  onAddLibrary, 
  onDeleteLibrary,
  onToggleTheme
}) => {
  return (
    <div className="h-full overflow-y-auto flex flex-col items-center p-8 md:p-20 transition-colors duration-700">
      
      {/* Zen Header */}
      <div className="w-full max-w-3xl mt-12 mb-20 flex items-end justify-between">
          <div>
            <h1 className="text-5xl font-bold tracking-tighter text-[var(--text-main)] mb-4">Index</h1>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-[0.3em]">Local Storage</p>
          </div>
          <button 
             onClick={onToggleTheme}
             className="p-4 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors glass-panel rounded-full hover:rotate-90 duration-500"
             title="Switch Theme"
          >
             <Palette className="w-5 h-5" strokeWidth={1} />
          </button>
      </div>

      {/* Floating Glass Stack */}
      <div className="w-full max-w-3xl space-y-6">
        {libraries.map((lib, index) => (
            <div 
              key={lib.id}
              onClick={() => onSelectLibrary(lib)}
              className="group relative w-full cursor-pointer perspective-1000"
              style={{ animationDelay: `${index * 100}ms` }}
            >
                {/* Glass Card */}
                <div className="relative z-10 glass-panel p-8 rounded-2xl transition-all duration-500 ease-out-expo group-hover:-translate-y-2 group-hover:shadow-[var(--shadow-zen)] flex items-center justify-between overflow-hidden">
                    {/* Abstract Decoration */}
                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-[var(--text-main)] opacity-[0.03] rounded-full blur-2xl group-hover:opacity-[0.08] transition-opacity duration-700" />

                    <div className="flex items-center gap-8 relative z-10">
                        <div className="w-14 h-14 flex items-center justify-center bg-[var(--bg-main)]/50 rounded-xl border border-[var(--border-glass)] text-[var(--text-muted)] group-hover:text-[var(--text-main)] group-hover:scale-110 transition-all duration-500">
                             <Layers className="w-6 h-6" strokeWidth={1} />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold text-[var(--text-main)] tracking-tight">{lib.name}</h3>
                            <p className="text-[10px] text-[var(--text-muted)] mt-2 uppercase tracking-widest font-medium">
                                Added {new Date(lib.addedAt).toLocaleDateString()}
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            if(confirm('Remove this collection?')) onDeleteLibrary(lib.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-3 text-[var(--text-muted)] hover:text-red-500 transition-all z-20"
                    >
                        <Trash2 className="w-4 h-4" strokeWidth={1} />
                    </button>
                </div>
            </div>
        ))}

        {/* Add New Pill */}
        {libraries.length < 5 && (
            <button 
               onClick={onAddLibrary}
               className="w-full p-8 rounded-2xl border border-dashed border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all flex items-center justify-center gap-4 group mt-8"
            >
               <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" strokeWidth={1} />
               <span className="text-xs uppercase tracking-[0.2em] font-medium">Import Directory</span>
            </button>
        )}
      </div>

      <div className="mt-auto py-16">
        <p className="text-[10px] text-[var(--text-muted)] opacity-40 uppercase tracking-widest">
            {libraries.length} / 5 Slots Used
        </p>
      </div>
    </div>
  );
};
