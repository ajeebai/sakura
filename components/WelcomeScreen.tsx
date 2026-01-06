
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
  
  useEffect(() => {
      if (isLoading) {
          setShowLoader(true);
      } else {
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
      className={`fixed inset-0 z-50 flex flex-col transition-all duration-1000 ease-[var(--ease-out-expo)] ${isDragging ? 'scale-[0.98] opacity-80' : 'scale-100'} dream-gradient`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="absolute inset-0 bg-[var(--bg-main)] opacity-30 mix-blend-multiply pointer-events-none"></div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
        
        {/* Main Content */}
        <div className={`max-w-4xl w-full text-center transition-all duration-500`}>
            <div className="space-y-8 mb-32">
                <h1 className="elegant-serif text-8xl md:text-[10rem] font-light italic tracking-tight text-[var(--text-main)] leading-[0.8] drop-shadow-xl animate-in fade-in duration-1000 slide-in-from-bottom-8">
                    Sakura
                </h1>
                <p className="text-lg md:text-xl text-[var(--text-main)] max-w-md mx-auto leading-relaxed font-light tracking-wide opacity-80 animate-in fade-in duration-1000 delay-300 slide-in-from-bottom-4">
                    Digital Zen for your library.
                </p>
            </div>

            <div className="flex flex-col items-center gap-12 h-[100px] justify-center">
                {showLoader ? (
                    <div className="flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-300">
                         <div className="w-16 h-[1px] bg-[var(--text-main)] overflow-hidden opacity-50">
                             <div className="w-full h-full bg-[var(--text-main)] animate-[progress_1s_ease-in-out_infinite]" />
                         </div>
                         <span className="text-[10px] text-[var(--text-main)] uppercase tracking-[0.3em] animate-pulse">{loadingMessage || 'Loading...'}</span>
                    </div>
                ) : (
                    <button
                        onClick={onOpenLibrary}
                        className="group relative px-12 py-6 bg-transparent transition-all duration-500 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500 rounded-full"
                    >
                        {/* Glass Pill Border */}
                        <div className="absolute inset-0 border border-[var(--text-main)] opacity-40 group-hover:opacity-100 rounded-full transition-opacity duration-500 bg-white/10 backdrop-blur-sm" />
                        
                        <div className="relative flex items-center gap-6 text-[var(--text-main)] transition-all duration-500">
                            <span className="text-sm font-semibold uppercase tracking-[0.2em]">Open Library</span>
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform duration-300" strokeWidth={1} />
                        </div>
                    </button>
                )}
            </div>
        </div>

        {/* Footer */}
        <div className={`absolute bottom-16 left-0 right-0 flex justify-center transition-opacity duration-1000 ${showLoader ? 'opacity-0' : 'opacity-60'} animate-in fade-in delay-700`}>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-main)]">
                Drag and drop folder
            </span>
        </div>
      </div>
    </div>
  );
};
