import React, { useState } from 'react';
import { Flower, FolderOpen } from 'lucide-react';

interface WelcomeScreenProps {
  onOpenLibrary: () => void;
  onDropFiles: (data: DataTransfer) => void;
  isLoading: boolean;
  loadingMessage: string;
  isBrowserSupported: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ 
    onOpenLibrary, 
    onDropFiles,
    isLoading, 
    loadingMessage,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer) {
        onDropFiles(e.dataTransfer);
    }
  };

  return (
    <div 
      className={`min-h-screen flex flex-col items-center justify-center relative overflow-hidden transition-colors duration-700 ease-in-out ${isDragging ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-main)]'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      
      {/* Ambient Background Pulse */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
         <div className={`w-96 h-96 rounded-full blur-[120px] bg-[var(--accent)] transition-transform duration-[3000ms] ${isLoading ? 'scale-150 animate-pulse' : 'scale-100'}`} />
      </div>

      <div className="z-10 flex flex-col items-center space-y-12 max-w-lg px-6">
        
        {/* Identity */}
        <div className="text-center space-y-6">
          <Flower className={`w-16 h-16 mx-auto text-[var(--accent)] transition-all duration-1000 ${isLoading ? 'animate-spin-slow opacity-50' : 'opacity-100'}`} strokeWidth={1} />
          <h1 className="text-6xl md:text-8xl font-serif tracking-tighter text-[var(--text-main)]">
            Sakura
          </h1>
          <p className="text-[var(--text-muted)] font-serif italic text-lg tracking-wide">
             Privacy-first. Offline-only.
          </p>
        </div>

        {/* Interaction Zone */}
        <div className="relative group w-full flex justify-center">
           {isLoading ? (
             <div className="flex flex-col items-center space-y-4">
               <p className="text-[var(--text-muted)] font-serif italic text-lg tracking-wide animate-pulse">
                 {loadingMessage}
               </p>
             </div>
           ) : (
             <button
               onClick={onOpenLibrary}
               className="relative overflow-hidden group rounded-full px-12 py-6 bg-transparent border border-[var(--border-color)] hover:border-[var(--accent)] transition-all duration-500 hover:shadow-[0_0_40px_-10px_var(--accent)]"
             >
               <span className="relative z-10 flex items-center space-x-3 text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors duration-300">
                 <FolderOpen className="w-5 h-5" />
                 <span className="font-serif text-lg tracking-wide">Open Local Folder</span>
               </span>
               
               {/* Button Hover Fill Effect */}
               <div className="absolute inset-0 bg-[var(--bg-card)] translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" />
             </button>
           )}
        </div>

        {/* Minimal Footer */}
        {!isLoading && (
          <p className="absolute bottom-10 text-[var(--text-muted)] text-xs tracking-widest opacity-40 uppercase">
             Drop folder here
          </p>
        )}
      </div>
    </div>
  );
};