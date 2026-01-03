
import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Spinner } from '@phosphor-icons/react';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Debounce the loading state to prevent flickering and ensure visibility
  useEffect(() => {
      if (isLoading) {
          setShowLoader(true);
      } else {
          const t = setTimeout(() => setShowLoader(false), 200);
          return () => clearTimeout(t);
      }
  }, [isLoading]);

  // Procedural Sakura Animation
  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Low resolution for retro aesthetic but high enough for shapes
      const w = 320; 
      const h = 180;
      canvas.width = w;
      canvas.height = h;

      const petals: {x: number, y: number, vx: number, vy: number, size: number, rotation: number, rotationSpeed: number}[] = [];
      const MAX_PETALS = 50;

      for (let i = 0; i < MAX_PETALS; i++) {
          petals.push({
              x: Math.random() * w,
              y: Math.random() * h,
              vx: (Math.random() - 0.5) * 0.5,
              vy: Math.random() * 0.5 + 0.3,
              size: Math.random() * 2 + 1.5,
              rotation: Math.random() * Math.PI * 2,
              rotationSpeed: (Math.random() - 0.5) * 0.05
          });
      }

      const loop = () => {
          ctx.clearRect(0, 0, w, h);
          
          const color = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#e5e5e5';
          ctx.fillStyle = color;
          
          petals.forEach(p => {
              p.x += p.vx + Math.sin(p.y * 0.05) * 0.2;
              p.y += p.vy;
              p.rotation += p.rotationSpeed;

              if (p.y > h + 10) { p.y = -10; p.x = Math.random() * w; }
              if (p.x > w + 10) p.x = -10;
              if (p.x < -10) p.x = w + 10;

              // Draw Petal
              ctx.save();
              ctx.translate(p.x, p.y);
              ctx.rotate(p.rotation);
              ctx.beginPath();
              
              // Organic Petal Shape
              // Start top center
              ctx.moveTo(0, -p.size);
              // Right curve
              ctx.bezierCurveTo(p.size, -p.size * 0.5, p.size, p.size * 0.5, 0, p.size * 1.5);
              // Left curve
              ctx.bezierCurveTo(-p.size, p.size * 0.5, -p.size, -p.size * 0.5, 0, -p.size);
              
              ctx.globalAlpha = 0.4;
              ctx.fill();
              ctx.restore();
          });

          requestAnimationFrame(loop);
      };
      
      const anim = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(anim);
  }, []);

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
      {/* Background Canvas */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-30 mix-blend-screen"
        style={{ imageRendering: 'auto' }} // Changed from pixelated to allow smoother petal shapes
      />

      <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
        
        {/* Main Content */}
        <div className={`max-w-4xl w-full text-center transition-all duration-500`}>
            <div className="space-y-6 mb-16">
                <h1 className="text-6xl md:text-8xl font-serif tracking-tighter text-[var(--text-main)] leading-none mix-blend-difference selection:bg-transparent">
                    Sakura.
                </h1>
                <p className="text-lg md:text-xl font-serif italic text-[var(--text-muted)] max-w-lg mx-auto leading-relaxed opacity-70 font-light">
                    A digital sanctuary for your library.
                </p>
            </div>

            <div className="flex flex-col items-center gap-12 h-[100px] justify-center">
                {showLoader ? (
                    <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300">
                         <div className="w-12 h-[1px] bg-[var(--border-color)] overflow-hidden">
                             <div className="w-full h-full bg-[var(--text-main)] animate-[progress_1s_ease-in-out_infinite]" />
                         </div>
                         <span className="mono text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] animate-pulse flex items-center gap-2">
                            {loadingMessage || 'Loading...'}
                         </span>
                    </div>
                ) : (
                    <button
                        onClick={onOpenLibrary}
                        className="group relative px-12 py-6 bg-transparent transition-all duration-500 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
                    >
                        <div className="absolute inset-0 border border-[var(--border-color)] group-hover:border-[var(--text-main)] transition-colors duration-500" />
                        <div className="absolute inset-0 bg-[var(--text-main)] scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left ease-[var(--ease-out-expo)]" />
                        
                        <div className="relative flex items-center gap-6 group-hover:text-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-500">
                            <span className="font-serif text-xl italic tracking-wide">Open Library</span>
                            <ArrowRight weight="light" className="w-5 h-5 group-hover:translate-x-2 transition-transform duration-300" />
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
