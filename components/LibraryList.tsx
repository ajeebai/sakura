import React from 'react';
import { Library } from '../types';
import { FolderHeart, Plus, Trash2, HardDrive, Palette } from 'lucide-react';

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
    <div className="h-full overflow-y-auto bg-[var(--bg-main)] flex flex-col items-center p-6 md:p-10 transition-colors duration-300">
      <div className="w-full max-w-4xl space-y-10 mt-10">
        <div className="flex items-end justify-between border-b border-[var(--border-color)] pb-6">
          <div className="text-left">
             <h1 className="text-3xl font-serif text-[var(--text-main)]">Collections</h1>
             <p className="text-[var(--text-muted)] mt-1">Manage your local library folders.</p>
          </div>
          <button 
             onClick={onToggleTheme}
             className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-card)] rounded-full transition-colors mb-1"
          >
             <Palette className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {libraries.map((lib) => (
            <div 
              key={lib.id}
              className="group relative bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6 hover:shadow-lg hover:border-[var(--accent)] transition-all duration-300 flex flex-col cursor-pointer"
              onClick={() => onSelectLibrary(lib)}
            >
              <div className="flex-1 flex flex-col space-y-4">
                <div className="flex items-start justify-between">
                    <div className="p-3 bg-[var(--bg-main)] rounded-lg transition-colors group-hover:text-[var(--accent)]">
                        <FolderHeart className="w-8 h-8 text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
                    </div>
                    <div className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-main)] px-2 py-1 rounded border border-[var(--border-color)]">
                        <HardDrive className="w-3 h-3 mr-1" />
                        Local
                    </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors truncate">
                    {lib.name}
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Added {new Date(lib.addedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if(confirm('Are you sure you want to remove this library?')) {
                    onDeleteLibrary(lib.id);
                  }
                }}
                className="absolute top-4 right-4 p-2 text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--bg-main)] rounded-full transition-all opacity-0 group-hover:opacity-100"
                title="Remove Library"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Add New Button */}
          {libraries.length < 5 && (
             <button 
               onClick={onAddLibrary}
               className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[var(--border-color)] rounded-xl hover:border-[var(--accent)] hover:bg-[var(--bg-card)] transition-all text-[var(--text-muted)] hover:text-[var(--accent)] gap-3 min-h-[160px]"
             >
               <Plus className="w-8 h-8" />
               <span className="font-medium">Add Library</span>
             </button>
          )}
        </div>
        
        {libraries.length >= 5 && (
            <p className="text-center text-xs text-[var(--text-muted)]">Maximum of 5 libraries reached.</p>
        )}
      </div>
    </div>
  );
};