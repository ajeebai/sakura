
import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';

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
  const [showLoader, setShowLoader] = useState(false);
  
  // Debounce the loading state to prevent flickering and ensure visibility
  useEffect(() => {
      if (isLoading) {
          setShowLoader(true);
      } else {
          // If we stop loading, verify if we are exiting or just done
          // Keep loader for a split second to smooth out the unmount
          const t = setTimeout(() => setShowLoader(false), 200);
          return () => clearTimeout(t);
      }
  }, [isLoading]);

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
      className={`fixed inset-0 z-50 flex flex-col bg-[var(--bg-main)] transition-all duration-1000 ease-[var(--ease-out-expo)] ${isDragging ? 'scale-[0.98] opacity-80' : 'scale-100'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
        
        {/* Main Content */}
        <div className={`max-w-4xl w-full text-center transition-all duration-500`}>
            <div className="space-y-8 mb-24">
                <h1 className="text-9xl md:text-[12rem] font-serif tracking-tighter text-[var(--text-main)] leading-[0.8] mix-blend-difference selection:bg-transparent">
                    Sakura.
                </h1>
                <p className="text-xl md:text-2xl font-serif italic text-[var(--text-muted)] max-w-lg mx-auto leading-relaxed opacity-60 font-light">
                    A digital sanctuary for your library.
                </p>
            </div>

            <div className="flex flex-col items-center gap-12 h-[100px] justify-center">
                {showLoader ? (
                    <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300">
                         <div className="w-12 h-[1px] bg-[var(--border-color)] overflow-hidden">
                             <div className="w-full h-full bg-[var(--text-main)] animate-[progress_1s_ease-in-out_infinite]" />
                         </div>
                         <span className="mono text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] animate-pulse">{loadingMessage || 'Loading...'}</span>
                    </div>
                ) : (
                    <button
                        onClick={onOpenLibrary}
                        className="group relative px-16 py-8 bg-transparent transition-all duration-500 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
                    >
                        <div className="absolute inset-0 border border-[var(--border-color)] group-hover:border-[var(--text-main)] transition-colors duration-500" />
                        <div className="absolute inset-0 bg-[var(--text-main)] scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left ease-[var(--ease-out-expo)]" />
                        
                        <div className="relative flex items-center gap-6 group-hover:text-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-500">
                            <span className="font-serif text-2xl italic tracking-wide">Open Library</span>
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform duration-300" />
                        </div>
                    </button>
                )}
            </div>
        </div>

        {/* Footer */}
        <div className={`absolute bottom-12 left-0 right-0 flex justify-center transition-opacity duration-1000 ${showLoader ? 'opacity-0' : 'opacity-30'}`}>
            <span className="mono text-[10px] uppercase tracking-[0.3em]">
                Drag and drop folder
            </span>
        </div>
      </div>
    </div>
  );
};
