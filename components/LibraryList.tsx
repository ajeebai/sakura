import React from 'react';
import { Library } from '../types';
import { Plus, Trash2, Palette, Folder } from 'lucide-react';

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
    <div className="h-full overflow-y-auto flex flex-col items-center p-6 md:p-12 transition-colors duration-700">
      
      {/* Header */}
      <div className="w-full max-w-2xl mt-12 mb-16 flex items-end justify-between border-b border-[var(--border-color)] pb-4">
          <div>
            <h1 className="text-4xl font-serif text-[var(--text-main)] mb-2">Collections</h1>
            <p className="mono text-xs text-[var(--text-muted)] uppercase tracking-widest">Index / Local Storage</p>
          </div>
          <button 
             onClick={onToggleTheme}
             className="p-3 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
             title="Toggle Theme"
          >
             <Palette className="w-5 h-5" />
          </button>
      </div>

      {/* The Stack */}
      <div className="w-full max-w-2xl space-y-2">
        {libraries.map((lib, index) => (
            <div 
              key={lib.id}
              onClick={() => onSelectLibrary(lib)}
              className="group relative w-full cursor-pointer"
              style={{ animationDelay: `${index * 50}ms` }}
            >
                {/* Folder Tab Look */}
                <div className="relative z-10 bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-lg transition-all duration-500 ease-out-expo group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-elevation)] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 flex items-center justify-center bg-[var(--bg-main)] rounded border border-[var(--border-color)] text-[var(--text-muted)] group-hover:text-[var(--text-main)] group-hover:border-[var(--text-main)] transition-all">
                             <Folder className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-lg font-medium text-[var(--text-main)]">{lib.name}</h3>
                            <p className="mono text-[10px] text-[var(--text-muted)] mt-1 uppercase tracking-wider">
                                {new Date(lib.addedAt).toLocaleDateString()}
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            if(confirm('Remove this collection?')) onDeleteLibrary(lib.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-2 text-[var(--text-muted)] hover:text-red-500 transition-all"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Stack Effect Behind */}
                <div className="absolute inset-0 bg-[var(--border-color)] rounded-lg transform translate-y-1 translate-x-1 -z-10 transition-transform duration-500 group-hover:translate-y-2 group-hover:translate-x-2 opacity-30" />
            </div>
        ))}

        {/* Add New Slot */}
        {libraries.length < 5 && (
            <button 
               onClick={onAddLibrary}
               className="w-full p-6 border border-dashed border-[var(--border-color)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all flex items-center justify-center gap-3 group mt-4"
            >
               <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
               <span className="mono text-xs uppercase tracking-widest">Import New Folder</span>
            </button>
        )}
      </div>

      <div className="mt-auto py-12">
        <p className="mono text-[10px] text-[var(--text-muted)] opacity-30">
            {libraries.length} / 5 Slots Used
        </p>
      </div>
    </div>
  );
};