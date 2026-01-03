
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Book, FileHandle, ReaderSettings } from '../types';
import { getFileUrl } from '../services/fileSystem';
import { ArrowLeft, Bookmark as BookmarkIcon } from 'lucide-react';
import * as pdfjsLibProxy from 'pdfjs-dist';
import { playClickSfx, playPageTurnSfx, playThumpSfx } from '../services/audio';
import { dbUpdateBook, dbAddBookmark, dbRemoveBookmark, dbGetBookmarksForBook } from '../services/db';

const pdfjsLib: any = (pdfjsLibProxy as any).default || pdfjsLibProxy;
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

interface ReaderViewProps {
  book: Book;
  onClose: () => void;
  onUpdateProgress: (bookId: string, pageIndex: number, totalPages: number) => void;
  settings: ReaderSettings;
  onSettingChange: (k: keyof ReaderSettings, v: any) => void;
  onContextMenu: (e: React.MouseEvent, pageIndex: number) => void;
  currentPage: number;
  setCurrentPage: (p: number) => void;
  bookmarks: Set<number>;
}

// --- Helper Components (Thumbnail, Page) remain same, condensed for brevity ---
const PdfPage: React.FC<{ pdfDoc: any; pageIndex: number; isActive: boolean; className?: string }> = React.memo(({ pdfDoc, pageIndex, isActive, className }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<any>(null);
    useEffect(() => {
        if (!isActive || !pdfDoc || !canvasRef.current) return;
        let active = true;
        const render = async () => {
            try {
                const page = await pdfDoc.getPage(pageIndex);
                if (!active) return;
                const viewport = page.getViewport({ scale: 2 });
                const canvas = canvasRef.current!;
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const context = canvas.getContext('2d');
                if (renderTaskRef.current) renderTaskRef.current.cancel();
                renderTaskRef.current = page.render({ canvasContext: context, viewport: viewport });
                await renderTaskRef.current.promise;
            } catch (e: any) { }
        };
        render();
        return () => { active = false; if (renderTaskRef.current) renderTaskRef.current.cancel(); };
    }, [pdfDoc, pageIndex, isActive]);
    return <canvas ref={canvasRef} className={`bg-white shadow-sm pointer-events-none ${className}`} style={{ width: '100%', height: 'auto' }} />;
});

const LazyImagePage: React.FC<{ handle: FileHandle; isActive: boolean; alt: string; className?: string; style?: React.CSSProperties }> = React.memo(({ handle, isActive, alt, className, style }) => {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        if (!isActive) { if(src) { URL.revokeObjectURL(src); setSrc(null); } return; }
        let active = true;
        getFileUrl(handle).then(url => { if(active) setSrc(url); });
        return () => { active = false; };
    }, [handle, isActive]);
    if (!src) return <div className="w-full h-[60vh] flex items-center justify-center text-[var(--text-muted)]"><div className="w-8 h-8 rounded-full border-2 border-t-[var(--accent)] animate-spin"/></div>;
    return <img src={src} alt={alt} className={`${className} pointer-events-none`} style={style} />;
});

export const ReaderView: React.FC<ReaderViewProps> = ({ 
    book, onClose, onUpdateProgress, settings, onContextMenu,
    currentPage, setCurrentPage, bookmarks
}) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfPages, setPdfPages] = useState<number>(0);
  const isPdf = book.format === 'pdf';
  const totalPages = isPdf ? pdfPages : book.pages.length;
  
  const [isClosing, setIsClosing] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next');
  const [flipPhase, setFlipPhase] = useState<'out' | 'in-start' | 'in-end' | 'idle'>('idle');
  const [showStamp, setShowStamp] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // --- ZOOM ENGINE STATE ---
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const transform = useRef({ x: 0, y: 0, k: 1 });
  const [scaleDisplay, setScaleDisplay] = useState(1);
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const lastTouchTime = useRef(0); // For double tap detection

  // Load PDF
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

  // Completion Logic
  useEffect(() => {
      // Don't mark progress if we are just looking at a generated "Favorites" book
      if (book.id === 'virtual-bookmarks') return;

      if (totalPages > 0) {
          const t = setTimeout(() => onUpdateProgress(book.id, currentPage, totalPages), 500);
          return () => clearTimeout(t);
      }
      if (totalPages > 0 && currentPage === totalPages - 1 && !showStamp) {
          setTimeout(() => { playThumpSfx(); setShowStamp(true); }, 800);
      } else if (currentPage !== totalPages - 1) {
          setShowStamp(false);
      }
  }, [currentPage, book.id, totalPages]);

  // --- Zoom Engine ---

  const updateTransform = () => {
      if (!contentRef.current) return;
      const { x, y, k } = transform.current;
      contentRef.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
      setScaleDisplay(k);
  };

  const resetZoom = useCallback(() => {
      transform.current = { x: 0, y: 0, k: 1 };
      updateTransform();
  }, []);

  const handleZoomToPoint = (clientX: number, clientY: number) => {
      if (!contentRef.current) return;
      
      if (transform.current.k > 1.2) {
          resetZoom();
      } else {
          const rect = contentRef.current.getBoundingClientRect();
          const targetK = 2.5;
          const vw = window.innerWidth / 2;
          const vh = window.innerHeight / 2;
          const dx = vw - clientX;
          const dy = vh - clientY;
          transform.current.k = targetK;
          transform.current.x = dx * targetK * 0.5; 
          transform.current.y = dy * targetK * 0.5;
          updateTransform();
      }
  };

  const handleWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey) {
          e.preventDefault();
          const delta = -e.deltaY * 0.002;
          let newScale = transform.current.k + delta * transform.current.k;
          newScale = Math.min(Math.max(0.5, newScale), 5);
          transform.current.k = newScale;
          if (newScale <= 1) { transform.current.x = 0; transform.current.y = 0; }
          updateTransform();
      } else {
          // Allow panning if zoomed
          if (transform.current.k > 1) {
             e.preventDefault(); 
             transform.current.x -= e.deltaX;
             transform.current.y -= e.deltaY;
             updateTransform();
          } else if (Math.abs(e.deltaX) > 50 && settings.viewMode !== 'vertical' && !isScrubbing) {
             if (e.deltaX > 0) settings.direction === 'LTR' ? navigate('next') : navigate('prev');
             else settings.direction === 'LTR' ? navigate('prev') : navigate('next');
          }
      }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
      // Touch Double Tap Logic
      if (e.pointerType === 'touch') {
          const now = Date.now();
          if (now - lastTouchTime.current < 300) {
              handleZoomToPoint(e.clientX, e.clientY);
          }
          lastTouchTime.current = now;
      }
      
      if (e.button === 0) { // Left click / Touch
        isDragging.current = true;
        startPos.current = { x: e.clientX, y: e.clientY };
      }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      if (transform.current.k <= 1) return; // Only drag if zoomed

      e.preventDefault();
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      
      transform.current.x += dx;
      transform.current.y += dy;
      
      startPos.current = { x: e.clientX, y: e.clientY };
      updateTransform();
  };

  const handlePointerUp = () => {
      isDragging.current = false;
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      handleZoomToPoint(e.clientX, e.clientY);
  };

  // --- Navigation ---

  const navigate = useCallback((direction: 'next' | 'prev') => {
      if (settings.viewMode === 'vertical') return;
      const isSpread = settings.viewMode === 'spread';
      let delta = settings.direction === 'LTR' ? 1 : -1;
      if (direction === 'prev') delta *= -1;
      if (isSpread) {
         if (direction === 'next') delta = (currentPage === 0) ? 1 : (delta * 2); 
         else delta = (currentPage === 1) ? -1 : (delta * 2);
      }
      const next = currentPage + delta;
      
      if (next >= 0 && next < totalPages) {
          if (settings.enableSfx) playPageTurnSfx();
          setFlipDirection(direction);
          setIsFlipping(true);
          setFlipPhase('out');
          resetZoom();
          setTimeout(() => {
              setCurrentPage(next);
              setFlipPhase('in-start');
              requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                      setFlipPhase('in-end');
                      setTimeout(() => { setFlipPhase('idle'); setIsFlipping(false); }, 400);
                  });
              });
          }, 300); 
      } else if (direction === 'prev' && next < 0) {
          setIsClosing(true);
          setTimeout(onClose, 300);
      }
  }, [currentPage, totalPages, settings, resetZoom, onClose]);

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const page = parseInt(e.target.value);
      setCurrentPage(page);
      if (settings.viewMode === 'vertical') {
          const el = document.querySelector(`[data-index='${page}']`);
          if (el) el.scrollIntoView({ behavior: 'auto' });
      }
  };

  // --- Render Helpers ---

  const getImageStyle = (): React.CSSProperties => {
      const style: React.CSSProperties = {};
      switch (settings.fitMode) {
          case 'width': style.width = '100vw'; style.height = 'auto'; style.maxWidth = 'none'; break;
          case 'height': style.height = '100vh'; style.width = 'auto'; style.maxWidth = 'none'; break;
          case 'original': style.maxWidth = 'none'; style.maxHeight = 'none'; break;
          case 'contain': default: style.maxWidth = '100%'; style.maxHeight = '100%'; style.objectFit = 'contain'; break;
      }
      return style;
  };

  const renderContent = (idx: number, active: boolean) => {
      if (idx >= totalPages) return <div className="w-full h-full bg-transparent" />;
      const isMarked = bookmarks.has(idx);
      
      return (
          <div className="relative w-full h-full flex items-center justify-center backface-hidden">
              {isPdf ? (
                  <PdfPage pdfDoc={pdfDoc} pageIndex={idx + 1} isActive={active} className="shadow-2xl max-h-screen max-w-full object-contain" />
              ) : (
                  <LazyImagePage handle={book.pages[idx].handle} isActive={active} alt={`Page ${idx}`} style={getImageStyle()} />
              )}
              {isMarked && (
                  <div className="absolute top-0 right-4 w-6 h-10 bg-red-600 shadow-lg z-20 flex items-end justify-center pb-1 pointer-events-none">
                      <div className="border-l-[12px] border-r-[12px] border-b-[10px] border-l-transparent border-r-transparent border-b-white/0 absolute bottom-[-10px] w-0 h-0 border-t-[10px] border-t-red-600" />
                      <BookmarkIcon className="w-3 h-3 text-white fill-current mb-1" />
                  </div>
              )}
          </div>
      );
  };

  const getFlipClass = () => {
      if (!isFlipping) return '';
      if (settings.transitionMode === 'datamosh') return 'datamosh-active';
      return flipPhase === 'out' ? 'flip-out' : flipPhase === 'in-start' ? 'flip-in-start' : 'flip-in-end';
  };

  return (
    <div 
      ref={containerRef}
      className={`fixed inset-0 z-50 bg-[var(--bg-main)] flex flex-col text-[var(--text-main)] select-none overflow-hidden transition-all duration-300 ${isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => onContextMenu(e, currentPage)}
    >
      {/* Top Controls */}
      <div className={`absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-6 z-30 opacity-0 hover:opacity-100 transition-opacity duration-300`}>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/90 backdrop-blur-md border border-white/5 pointer-events-auto">
            <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="bg-black/40 backdrop-blur px-3 py-1 rounded-full text-xs font-mono border border-white/10 pointer-events-none">
            {currentPage + 1} / {totalPages}
        </div>
      </div>

      {/* Main Viewport */}
      <div className={`relative flex-1 w-full h-full overflow-hidden ${scaleDisplay > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}>
          {settings.viewMode === 'vertical' ? (
              <div className="w-full h-full overflow-y-auto">
                 {Array.from({ length: totalPages }).map((_, idx) => (
                    <div key={idx} data-index={idx} className="page-container flex justify-center mb-8 min-h-[50vh]">
                       {Math.abs(currentPage - idx) < 5 && renderContent(idx, true)}
                    </div>
                 ))}
                 {showStamp && (
                    <div className="flex justify-center pb-24">
                        <div className="hanko-seal w-48 h-48 rounded-full border-4 border-red-800 flex flex-col items-center justify-center text-red-800 rotate-[-15deg] backdrop-blur-sm bg-red-50/10">
                             <span className="text-4xl font-serif font-bold">READ</span>
                             <span className="text-sm font-mono mt-2">{new Date().toLocaleDateString()}</span>
                        </div>
                    </div>
                 )}
              </div>
          ) : (
              <div className="w-full h-full flex items-center justify-center perspective-2000">
                  <div
                     ref={contentRef}
                     className={`relative w-full h-full flex items-center justify-center flip-container ${getFlipClass()}`}
                     style={{ transformOrigin: 'center center' }}
                     data-flip-direction={flipDirection}
                  >
                      {/* Reader Content Rendering Logic */}
                      {settings.viewMode === 'spread' && currentPage > 0 && currentPage < totalPages ? (
                          <div className="flex w-full h-full items-center justify-center gap-1">
                              {settings.direction === 'LTR' ? (
                                  <>
                                    <div className="flex-1 h-full flex justify-end">{renderContent(currentPage, true)}</div>
                                    <div className="flex-1 h-full flex justify-start">{renderContent(currentPage + 1, true)}</div>
                                  </>
                              ) : (
                                  <>
                                    <div className="flex-1 h-full flex justify-end">{renderContent(currentPage + 1, true)}</div>
                                    <div className="flex-1 h-full flex justify-start">{renderContent(currentPage, true)}</div>
                                  </>
                              )}
                          </div>
                      ) : (
                          <div className="absolute inset-0 flex items-center justify-center backface-hidden">
                              {renderContent(currentPage, true)}
                          </div>
                      )}
                  </div>
                  
                  {showStamp && (
                    <div className="absolute bottom-24 right-12 z-50 pointer-events-none">
                        <div className="hanko-seal w-32 h-32 rounded-full border-4 border-red-800 flex flex-col items-center justify-center text-red-800">
                             <span className="text-2xl font-serif font-bold">READ</span>
                             <span className="text-xs font-mono mt-1">{new Date().toLocaleDateString()}</span>
                        </div>
                    </div>
                  )}
              </div>
          )}
      </div>

      {/* Scrubber Control */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center pb-6 px-12 z-30 opacity-0 hover:opacity-100 transition-opacity duration-300 group"
        onMouseEnter={() => setIsScrubbing(true)}
        onMouseLeave={() => setIsScrubbing(false)}
      >
          <input 
            type="range" 
            min="0" 
            max={Math.max(0, totalPages - 1)} 
            value={currentPage}
            onChange={handleScrubberChange}
            className="w-full max-w-xl h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[var(--accent)] hover:bg-white/40 transition-colors"
          />
      </div>
    </div>
  );
};
