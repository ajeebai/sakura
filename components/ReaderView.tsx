import React, { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { Book, FileHandle, ReaderSettings, ImageFitMode, ReadingDirection } from '../types';
import { getFileUrl } from '../services/fileSystem';
import { dbGetReaderSettings, dbSaveReaderSettings, dbAddBookmark, dbRemoveBookmark, dbGetBookmarksForBook } from '../services/db';
import { 
    ArrowLeft, Maximize2, Minimize2, ZoomIn, ZoomOut, 
    MoveVertical, Smartphone, AlertTriangle, 
    Settings2, ArrowRightLeft, Expand, Monitor, AlignCenter,
    ChevronLeft, ChevronRight, Play, Pause, Heart, Sparkles, Scissors
} from 'lucide-react';
import * as pdfjsLibProxy from 'pdfjs-dist';

const pdfjsLib: any = (pdfjsLibProxy as any).default || pdfjsLibProxy;
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

interface ReaderViewProps {
  book: Book;
  onClose: () => void;
  onUpdateProgress: (bookId: string, pageIndex: number, totalPages: number) => void;
}

// --- PDF Page Component ---
const PdfPage: React.FC<{
    pdfDoc: any;
    pageIndex: number; 
    scale: number;
    isActive: boolean;
    className?: string;
    onRenderSuccess?: () => void;
}> = React.memo(({ pdfDoc, pageIndex, scale, isActive, className, onRenderSuccess }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<any>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!isActive || !pdfDoc || !canvasRef.current) return;
        let active = true;
        const render = async () => {
            try {
                const page = await pdfDoc.getPage(pageIndex);
                if (!active) return;
                const viewport = page.getViewport({ scale: scale * window.devicePixelRatio });
                const canvas = canvasRef.current!;
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
                canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;
                const context = canvas.getContext('2d');
                if (renderTaskRef.current) renderTaskRef.current.cancel();
                renderTaskRef.current = page.render({ canvasContext: context, viewport: viewport });
                await renderTaskRef.current.promise;
                if (active && onRenderSuccess) onRenderSuccess();
            } catch (e: any) {
                if (e.name !== 'RenderingCancelledException') setError(true);
            }
        };
        render();
        return () => { active = false; if (renderTaskRef.current) renderTaskRef.current.cancel(); };
    }, [pdfDoc, pageIndex, scale, isActive, onRenderSuccess]);

    if (error) return <div className="p-8 text-red-500"><AlertTriangle /></div>;
    return <canvas ref={canvasRef} className={`bg-white shadow-sm ${className}`} />;
});

// --- Image Page Component ---
const LazyImagePage: React.FC<{ 
    handle: FileHandle; 
    isActive: boolean; 
    alt: string; 
    className?: string; 
    style?: React.CSSProperties;
    onLoad?: (src: string) => void;
}> = React.memo(({ handle, isActive, alt, className, style, onLoad }) => {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        if (!isActive) { if(src) { URL.revokeObjectURL(src); setSrc(null); } return; }
        let active = true;
        getFileUrl(handle).then(url => { 
            if(active) {
                setSrc(url);
                if (onLoad) onLoad(url);
            }
        });
        return () => { active = false; };
    }, [handle, isActive]);

    if (!src) return <div className="w-full h-[60vh] flex items-center justify-center text-[var(--text-muted)]"><div className="w-8 h-8 rounded-full border-2 border-t-[var(--accent)] animate-spin"/></div>;
    return <img src={src} alt={alt} className={className} style={style} />;
});

export const ReaderView: React.FC<ReaderViewProps> = ({ book, onClose, onUpdateProgress }) => {
  // --- Configuration State ---
  const [settings, setSettings] = useState<ReaderSettings>({ 
      direction: 'LTR', fitMode: 'contain', viewMode: 'vertical', slideshowInterval: 3, zenMode: false, smartSplit: false 
  });
  
  // --- Navigation State ---
  const [currentPage, setCurrentPage] = useState(() => book.readingProgress?.currentPageIndex || 0);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfPages, setPdfPages] = useState<number>(0);
  const isPdf = book.format === 'pdf';
  const totalPages = isPdf ? pdfPages : book.pages.length;

  // --- UI State ---
  const [showControls, setShowControls] = useState(true);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [currentImageSrc, setCurrentImageSrc] = useState<string | null>(null);
  
  // --- High Performance Transform State (Direct DOM) ---
  const transform = useRef({ scale: 1, panX: 0, panY: 0 });
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  
  // Sync React State for UI controls
  const [scaleDisplay, setScaleDisplay] = useState(1);
  
  // Gesture Accumulators
  const wheelAccumulator = useRef(0);
  const wheelTimeout = useRef<number | null>(null);

  // --- Initialization ---
  useEffect(() => {
      dbGetReaderSettings().then(setSettings);
      dbGetBookmarksForBook(book.id).then(indices => setBookmarks(new Set(indices)));
  }, [book.id]);

  useEffect(() => {
      if (totalPages > 0) {
          const t = setTimeout(() => onUpdateProgress(book.id, currentPage, totalPages), 500);
          return () => clearTimeout(t);
      }
  }, [currentPage, book.id, totalPages]);

  useEffect(() => {
      if (!isPdf) return;
      (async () => {
          try {
              const file = await (book.handle as any).getFile();
              const ab = await file.arrayBuffer();
              const doc = await pdfjsLib.getDocument(ab).promise;
              setPdfDoc(doc);
              setPdfPages(doc.numPages);
          } catch(e) { console.error(e); }
      })();
  }, [book.id, isPdf]);

  const updateSetting = (key: keyof ReaderSettings, value: any) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      dbSaveReaderSettings(newSettings);
  };

  // --- Reset Transforms Helper ---
  const resetTransform = useCallback(() => {
      transform.current = { scale: 1, panX: 0, panY: 0 };
      if (contentRef.current) {
          contentRef.current.style.transform = `translate(0px, 0px) scale(1)`;
      }
      setScaleDisplay(1);
  }, []);

  // --- Navigation Engine ---
  const navigate = useCallback((direction: 'next' | 'prev') => {
      if (settings.viewMode === 'vertical') return; // Scroll logic handles vertical
      
      let delta = settings.direction === 'LTR' ? 1 : -1;
      if (direction === 'prev') delta *= -1;

      const next = currentPage + delta;
      if (next >= 0 && next < totalPages) {
          setCurrentPage(next);
          resetTransform(); // Reset Zoom on page turn
      } else if (isSlideshowActive) {
          setIsSlideshowActive(false);
      }
  }, [currentPage, totalPages, settings.direction, settings.viewMode, isSlideshowActive, resetTransform]);

  // --- Direct DOM Transform Updater ---
  const updateContentTransform = () => {
      if (contentRef.current) {
          const { panX, panY, scale } = transform.current;
          contentRef.current.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      }
  };

  // --- Unified Gesture Engine ---
  const handleWheel = (e: React.WheelEvent) => {
      const { scale } = transform.current;

      // 1. Zooming (Ctrl+Wheel or Pinch)
      if (e.ctrlKey) {
          e.preventDefault();
          const zoomSensitivity = 0.005; // Finer zoom
          const delta = -e.deltaY * zoomSensitivity;
          
          let newScale = scale + delta;
          
          // Snap to 100% if close
          if (Math.abs(newScale - 1) < 0.05) newScale = 1;

          // Allow zooming out to 25% and up to 500%
          newScale = Math.min(Math.max(0.25, newScale), 5);

          transform.current.scale = newScale;
          
          // Reset pan if zoomed out or exactly 100% (auto-center)
          if (newScale <= 1) {
              transform.current.panX = 0;
              transform.current.panY = 0;
          }
          
          updateContentTransform();
          setScaleDisplay(newScale);
          return;
      }

      // 2. Panning (When zoomed in)
      if (scale > 1) {
          e.preventDefault();
          // Direct DOM panning (60fps)
          transform.current.panX -= e.deltaX;
          transform.current.panY -= e.deltaY;
          updateContentTransform();
          return;
      }

      // 3. Native Vertical Scroll (Vertical Mode @ 1x or less)
      if (settings.viewMode === 'vertical') {
          return; // Allow native scroll
      }

      // 4. Page Turning (Single Mode @ 1x or less) - Horizontal Swipe
      // Swipe Logic: Accumulate deltas to detect intention
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          e.preventDefault(); // Stop Browser Back gesture
          
          wheelAccumulator.current += e.deltaX;

          if (wheelTimeout.current) clearTimeout(wheelTimeout.current);
          wheelTimeout.current = window.setTimeout(() => {
              wheelAccumulator.current = 0;
          }, 150);

          const THRESHOLD = 50; // Swipe sensitivity

          if (wheelAccumulator.current > THRESHOLD) {
              // Scrolled Right -> Next Page (LTR)
              settings.direction === 'LTR' ? navigate('next') : navigate('prev');
              wheelAccumulator.current = 0; // Reset
          } else if (wheelAccumulator.current < -THRESHOLD) {
              // Scrolled Left -> Prev Page (LTR)
              settings.direction === 'LTR' ? navigate('prev') : navigate('next');
              wheelAccumulator.current = 0;
          }
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (transform.current.scale > 1) {
          isDragging.current = true;
          dragStart.current = { 
              x: e.clientX - transform.current.panX, 
              y: e.clientY - transform.current.panY 
          };
          e.preventDefault();
          if (contentRef.current) contentRef.current.style.cursor = 'grabbing';
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDragging.current && transform.current.scale > 1) {
          e.preventDefault();
          transform.current.panX = e.clientX - dragStart.current.x;
          transform.current.panY = e.clientY - dragStart.current.y;
          updateContentTransform();
      }
  };

  const handleMouseUp = () => {
      isDragging.current = false;
      if (contentRef.current) {
          contentRef.current.style.cursor = transform.current.scale > 1 ? 'grab' : 'default';
      }
  };

  const handleClick = (e: React.MouseEvent) => {
      if (isDragging.current) return;
      if (transform.current.scale > 1) return;

      const w = window.innerWidth;
      // Center zone toggles controls
      if (e.clientX > w * 0.3 && e.clientX < w * 0.7) {
          setShowControls(prev => !prev);
      } else if (settings.viewMode === 'single') {
          if (e.clientX < w * 0.3) settings.direction === 'LTR' ? navigate('prev') : navigate('next');
          if (e.clientX > w * 0.7) settings.direction === 'LTR' ? navigate('next') : navigate('prev');
      }
  };

  // --- Keyboard ---
  useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowRight') settings.direction === 'LTR' ? navigate('next') : navigate('prev');
          if (e.key === 'ArrowLeft') settings.direction === 'LTR' ? navigate('prev') : navigate('next');
          if (e.key === ' ') { e.preventDefault(); navigate('next'); }
          if (e.key === 'f') toggleFullscreen();
          if (e.key === '0') resetTransform();
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [navigate, onClose, settings, resetTransform]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen().catch(console.error);
        setIsFullscreen(true);
    } else {
        document.exitFullscreen();
        setIsFullscreen(false);
    }
  };

  // --- Slideshow ---
  useEffect(() => {
      if (!isSlideshowActive) return;
      setShowControls(false);
      const interval = setInterval(() => navigate('next'), settings.slideshowInterval * 1000);
      return () => clearInterval(interval);
  }, [isSlideshowActive, navigate, settings.slideshowInterval]);

  // --- Scroll Sync (Vertical) ---
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  useLayoutEffect(() => {
      // If switching to vertical mode or loading, scroll to current page
      if (settings.viewMode === 'vertical' && transform.current.scale === 1 && pageRefs.current[currentPage]) {
          pageRefs.current[currentPage]?.scrollIntoView({ block: 'start' });
      }
  }, [settings.viewMode, currentPage]); // Intentionally not dependent on 'scale' to avoid jumping when zooming

  const getImageStyle = (): React.CSSProperties => {
      // We don't use React style for transform anymore to improve performance.
      // We only use this for basic fit sizing.
      const style: React.CSSProperties = {};
      
      switch (settings.fitMode) {
          case 'width': style.width = '100vw'; style.height = 'auto'; style.maxWidth = 'none'; break;
          case 'height': style.height = '100vh'; style.width = 'auto'; style.maxWidth = 'none'; break;
          case 'original': style.maxWidth = 'none'; style.maxHeight = 'none'; break;
          case 'contain': default: style.maxWidth = '100%'; style.maxHeight = '100%'; style.objectFit = 'contain'; break;
      }
      return style;
  };

  const toggleBookmark = async (idx = currentPage) => {
      if (bookmarks.has(idx)) {
          await dbRemoveBookmark(book.id, idx);
          setBookmarks(prev => { const n = new Set(prev); n.delete(idx); return n; });
      } else {
          await dbAddBookmark(book.id, idx);
          setBookmarks(prev => new Set(prev).add(idx));
      }
  };

  return (
    <div 
      ref={containerRef}
      className={`fixed inset-0 z-50 bg-[var(--bg-main)] flex flex-col text-[var(--text-main)] select-none overflow-hidden`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      
      {/* Zen Mode Ambient Background */}
      {settings.zenMode && currentImageSrc && (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-50 transition-opacity duration-1000">
              <img 
                  src={currentImageSrc} 
                  alt="" 
                  className="w-full h-full object-cover blur-3xl scale-125 opacity-40 brightness-75" 
              />
              <div className="absolute inset-0 bg-black/40" />
          </div>
      )}

      {/* Top Controls */}
      <div className={`absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-6 z-30 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/90 backdrop-blur-md border border-white/5">
            <ArrowLeft className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3">
             <button onClick={() => toggleBookmark(currentPage)} className={`p-2 rounded-full backdrop-blur-md border transition-all ${bookmarks.has(currentPage) ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'hover:bg-white/10 text-white/90 border-white/10'}`}>
                 <Heart className={`w-5 h-5 ${bookmarks.has(currentPage) ? 'fill-current' : ''}`} />
             </button>

             <span className="text-white/80 font-mono text-xs bg-black/40 px-2 py-1 rounded backdrop-blur-md border border-white/5">
                 {currentPage + 1} / {totalPages}
             </span>
             
             <button onClick={() => setShowSettingsPanel(!showSettingsPanel)} className={`p-2 rounded-full backdrop-blur-md border transition-all ${showSettingsPanel ? 'bg-white text-black border-white' : 'hover:bg-white/10 text-white/90 border-white/10'}`}>
                <Settings2 className="w-5 h-5" />
             </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettingsPanel && (
          <div className="absolute top-20 right-6 z-40 w-72 bg-[var(--bg-card)]/95 backdrop-blur-xl border border-[var(--border-color)] rounded-2xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[80vh]">
              <div className="space-y-6">
                  {/* Mode & Zen */}
                  <div className="space-y-2">
                       <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Experience</label>
                       <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => updateSetting('viewMode', 'single')} className={`p-2 rounded border text-xs ${settings.viewMode==='single' ? 'bg-[var(--accent)] text-white border-transparent' : 'border-[var(--border-color)]'}`}>Single</button>
                            <button onClick={() => updateSetting('viewMode', 'vertical')} className={`p-2 rounded border text-xs ${settings.viewMode==='vertical' ? 'bg-[var(--accent)] text-white border-transparent' : 'border-[var(--border-color)]'}`}>Scroll</button>
                       </div>
                       <button onClick={() => updateSetting('zenMode', !settings.zenMode)} className={`w-full flex items-center justify-between p-2 rounded border text-xs transition-colors ${settings.zenMode ? 'bg-purple-900/50 border-purple-500 text-purple-100' : 'border-[var(--border-color)]'}`}>
                           <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Zen Mode</span>
                           <span className="text-[10px] uppercase">{settings.zenMode ? 'ON' : 'OFF'}</span>
                       </button>
                  </div>
                  {/* Single View Settings */}
                  {settings.viewMode === 'single' && (
                      <>
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Direction</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => updateSetting('direction', 'LTR')} className={`p-2 rounded border text-xs ${settings.direction==='LTR' ? 'bg-[var(--text-main)] text-[var(--bg-main)]' : 'border-[var(--border-color)]'}`}>LTR</button>
                                <button onClick={() => updateSetting('direction', 'RTL')} className={`p-2 rounded border text-xs ${settings.direction==='RTL' ? 'bg-[var(--text-main)] text-[var(--bg-main)]' : 'border-[var(--border-color)]'}`}>Manga</button>
                            </div>
                        </div>
                        <div className="space-y-2">
                             <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Fit</label>
                             <div className="grid grid-cols-4 gap-1">
                                {[{id:'contain',icon:<Minimize2 className="w-3"/>},{id:'width',icon:<AlignCenter className="w-3 rotate-90"/>},{id:'height',icon:<AlignCenter className="w-3"/>},{id:'original',icon:<Expand className="w-3"/>}].map(o => (
                                    <button key={o.id} onClick={() => updateSetting('fitMode', o.id)} className={`p-2 flex justify-center rounded border ${settings.fitMode===o.id ? 'bg-[var(--text-main)] text-[var(--bg-main)]' : 'border-[var(--border-color)]'}`}>{o.icon}</button>
                                ))}
                             </div>
                        </div>
                      </>
                  )}
                  {/* Slideshow */}
                  <div className="space-y-2">
                      <div className="flex justify-between text-xs"><span>Slideshow</span><span>{settings.slideshowInterval}s</span></div>
                      <input type="range" min="1" max="10" value={settings.slideshowInterval} onChange={(e) => updateSetting('slideshowInterval', Number(e.target.value))} className="w-full accent-[var(--accent)]" />
                  </div>
              </div>
          </div>
      )}

      {/* Main Viewport */}
      <div 
        className={`relative flex-1 w-full h-full overflow-hidden ${scaleDisplay > 1 ? 'cursor-grab' : ''}`}
      >
          
          {/* 
              Vertical Scroll Container 
              - If scale == 1: Native scrolling enabled (overflow-y-auto).
              - If scale > 1: Native scrolling disabled, manual panning via CSS transform.
          */}
          {settings.viewMode === 'vertical' ? (
              <div 
                 className={`w-full h-full scroll-smooth ${scaleDisplay > 1 ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}
                 onClick={(e) => { if(scaleDisplay===1) handleClick(e); }}
              >
                  {/* The Transform Layer */}
                  <div 
                    ref={contentRef}
                    className="flex flex-col items-center min-h-full py-20 origin-top-center will-change-transform"
                    style={{
                        transformOrigin: 'top center'
                    }}
                  >
                      {Array.from({ length: totalPages }).map((_, idx) => (
                          <div key={idx} ref={el => { pageRefs.current[idx] = el; }} className="relative mb-4 max-w-full">
                               {/* Lazy Render Window */}
                               {Math.abs(currentPage - idx) < 4 ? (
                                    isPdf ? (
                                        <PdfPage pdfDoc={pdfDoc} pageIndex={idx + 1} scale={1.5} isActive={true} className="shadow-lg" />
                                    ) : (
                                        <LazyImagePage 
                                            handle={book.pages[idx].handle} 
                                            isActive={true} 
                                            alt={`Page ${idx}`} 
                                            onLoad={(s) => { if(idx === currentPage) setCurrentImageSrc(s); }}
                                            className="max-w-full h-auto shadow-md"
                                        />
                                    )
                               ) : <div className="w-[100px] h-[800px]" />}
                               
                               {bookmarks.has(idx) && (
                                   <div className="absolute top-2 right-2 p-2 bg-[var(--accent)] text-white rounded-full shadow-lg">
                                       <Heart className="w-4 h-4 fill-current" />
                                   </div>
                               )}
                          </div>
                      ))}
                  </div>
              </div>
          ) : (
              // Single View
              <div 
                  className="w-full h-full flex items-center justify-center"
                  onClick={handleClick}
              >
                  <div
                     ref={contentRef}
                     className="will-change-transform flex items-center justify-center w-full h-full"
                     style={{
                         transformOrigin: 'center center',
                     }}
                  >
                      {isPdf ? (
                          <PdfPage pdfDoc={pdfDoc} pageIndex={currentPage + 1} scale={2} isActive={true} className="shadow-2xl max-h-screen max-w-full object-contain" />
                      ) : (
                          <LazyImagePage 
                              handle={book.pages[currentPage].handle}
                              isActive={true}
                              alt={`Page ${currentPage}`}
                              onLoad={(s) => setCurrentImageSrc(s)}
                              style={getImageStyle()}
                          />
                      )}
                  </div>
              </div>
          )}
      </div>

      {/* Bottom Controls */}
      <div className={`absolute bottom-8 left-0 right-0 flex justify-center z-30 transition-all duration-300 transform ${showControls ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}`}>
         <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-full px-6 py-3 flex items-center space-x-6 shadow-2xl">
            <button onClick={() => setIsSlideshowActive(!isSlideshowActive)} className={`p-2 rounded-full transition-colors ${isSlideshowActive ? 'bg-[var(--accent)] text-white' : 'text-white/80 hover:text-white'}`}>
                {isSlideshowActive ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <div className="w-px h-4 bg-white/20" />

            <button onClick={() => settings.direction === 'LTR' ? navigate('prev') : navigate('next')} className="text-white/80 hover:text-white">
                <ChevronLeft className="w-6 h-6" />
            </button>

            <input 
              type="range" min={0} max={totalPages - 1} value={currentPage}
              onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setCurrentPage(val);
                  if (settings.viewMode === 'vertical' && pageRefs.current[val]) {
                      pageRefs.current[val]?.scrollIntoView();
                  }
              }}
              className="w-32 md:w-48 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
            />
            
            <button onClick={() => settings.direction === 'LTR' ? navigate('next') : navigate('prev')} className="text-white/80 hover:text-white">
                <ChevronRight className="w-6 h-6" />
            </button>

            <div className="w-px h-4 bg-white/20 mx-2" />

            <button onClick={toggleFullscreen} className="text-white/80 hover:text-white">
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
         </div>
      </div>
    </div>
  );
};