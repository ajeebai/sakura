
import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, FolderInput, UploadCloud } from 'lucide-react';

interface WelcomeScreenProps {
  onOpenLibrary: () => void;
  onDropFiles: (data: DataTransfer) => void;
  isLoading: boolean;
  loadingMessage: string;
  isBrowserSupported: boolean;
}

const SakuraIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="currentColor">
    <path d="M50 35 C40 10, 10 30, 20 50 C10 70, 40 90, 50 65 C60 90, 90 70, 80 50 C90 30, 60 10, 50 35 Z" opacity="0.8" />
    <circle cx="50" cy="50" r="5" fill="var(--bg-main)" opacity="0.8" />
  </svg>
);

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
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-1000 ease-[var(--ease-out-expo)] ${isDragging ? 'scale-95 opacity-80' : 'scale-100'} dream-gradient`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop Overlay */}
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${isDragging ? 'opacity-100' : 'opacity-0'} z-[60] bg-white/50 backdrop-blur-md`}>
          <div className="border-2 border-dashed border-stone-800 rounded-3xl p-20 animate-pulse">
              <UploadCloud className="w-20 h-20 text-stone-800 mx-auto mb-4" strokeWidth={1} />
              <p className="text-2xl font-light text-stone-800 tracking-widest uppercase">Release to Import</p>
          </div>
      </div>

      <div className="relative z-10 p-8">
        
        {/* Single Glass Unit */}
        <div className="glass-panel p-16 rounded-[40px] flex flex-col items-center shadow-2xl transition-all duration-500 hover:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] max-w-lg w-full relative overflow-hidden">
            
            {/* Sakura Icon Visual Device */}
            <div className="mb-10 text-stone-800 animate-in fade-in zoom-in duration-1000 delay-100">
                <SakuraIcon className="w-16 h-16 animate-[spin_60s_linear_infinite]" />
            </div>

            <div className="space-y-6 mb-12 text-center">
                <h1 className="elegant-serif text-8xl font-light italic tracking-tight text-stone-900 leading-[0.8] drop-shadow-sm animate-in fade-in duration-1000 slide-in-from-bottom-8">
                    Sakura
                </h1>
            </div>

            <div className="w-full flex justify-center min-h-[80px]">
                {showLoader ? (
                    <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                         <div className="w-16 h-[1px] bg-stone-300 overflow-hidden">
                             <div className="w-full h-full bg-stone-800 animate-[progress_1s_ease-in-out_infinite]" />
                         </div>
                         <span className="text-[10px] text-stone-500 uppercase tracking-[0.3em] animate-pulse">{loadingMessage || 'Loading...'}</span>
                    </div>
                ) : (
                    /* Unified Button */
                    <button
                        onClick={onOpenLibrary}
                        className="group relative w-full px-8 py-5 bg-stone-900 text-white overflow-hidden rounded-2xl transition-transform duration-300 active:scale-95 hover:bg-black"
                    >
                        <div className="relative flex items-center justify-center gap-3">
                            <span className="text-sm font-medium uppercase tracking-widest">Open or Drop Library</span>
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" strokeWidth={1} />
                        </div>
                        {/* Invisible Drop Target for Click to Open file dialog logic which is handled by parent passing onClick */}
                    </button>
                )}
            </div>

            <div className="mt-8 text-[10px] uppercase tracking-[0.3em] text-stone-400 font-medium">
                Offline &bull; Private
            </div>
        </div>
      </div>
    </div>
  );
};
