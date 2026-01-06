
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Book, FileHandle, ReaderSettings } from '../types';
import { getFileUrl } from '../services/fileSystem';
import { Bookmark as BookmarkIcon } from 'lucide-react';
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
  // External control for bookmarks via radial menu
  onRegisterBookmarkAction: (callback: () => void) => void;
  onBookmarkStatusChange: (isBookmarked: boolean) => void;
}

// --- Helper Components ---

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
    if (!src) return <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] bg-[var(--bg-card)]/10"><div className="w-8 h-8 rounded-full border-2 border-t-[var(--accent)] animate-spin"/></div>;
    return <img src={src} alt={alt} className={`${className} pointer-events-none select-none`} style={style} />;
});

// Left Sidebar Thumbnail Scrubber
const ThumbnailScrubber: React.FC<{ 
    pages: any[]; 
    currentPage: number; 
    onJump: (idx: number) => void;
    pdfDoc: any; 
    isPdf: boolean;
}> = ({ pages, currentPage, onJump, pdfDoc, isPdf }) => {
    return (
        <div className="fixed left-0 top-0 bottom-0 w-16 hover:w-24 bg-[var(--bg-main)]/30 hover:bg-[var(--bg-main)]/90 backdrop-blur-sm border-r border-[var(--border-color)] z-[60] transition-all duration-300 overflow-y-auto scrollbar-hide group flex flex-col items-center py-4 gap-2">
            {pages.map((p, idx) => (
                <div 
                    key={idx} 
                    onClick={() => onJump(idx)}
                    className={`relative w-10 h-14 hover:w-16 hover:h-24 transition-all duration-300 flex-shrink-0 cursor-pointer rounded overflow-hidden border ${idx === currentPage ? 'border-[var(--accent)]' : 'border-transparent hover:border-[var(--text-muted)]'}`}
                >
                    {/* Render minimal thumbnail. For pure image folders, using full LazyImagePage with small dimensions is okay if browser caches, 
                        but ideally we'd generate real thumbs. For simplicity, we stick to LazyImagePage but it will load full size img and downscale. */}
                    {Math.abs(currentPage - idx) < 20 && ( // Only render thumbs near current for perf
                        isPdf ? (
                            <div className="w-full h-full bg-white" /> 
                        ) : (
                            <LazyImagePage handle={p.handle} isActive={true} alt={`Pg ${idx}`} className="w-full h-full object-cover" />
                        )
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-[8px] text-white font-mono opacity-0 group-hover:opacity-100">
                        {idx + 1}
                    </div>
                </div>
            ))}
        </div>
    );
}

export const ReaderView: React.FC<ReaderViewProps> = ({ 
    book, onClose, onUpdateProgress, settings, onSettingChange, 
    onRegisterBookmarkAction, onBookmarkStatusChange 
}) => {
  const [currentPage, setCurrentPage] = useState(() => book.readingProgress?.currentPageIndex || 0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfPages, setPdfPages] = useState<number>(0);
  const isPdf = book.format === 'pdf';
  const totalPages = isPdf ? pdfPages : book.pages.length;
  
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [isClosing, setIsClosing] = useState(false);
  
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next');
  const [flipPhase, setFlipPhase] = useState<'out' | 'in-start' | 'in-end' | 'idle'>('idle');
  const [showStamp, setShowStamp] = useState(false);

  // --- ZOOM ENGINE STATE ---
  const contentRef = useRef<HTMLDivElement>(null);
  const transform = useRef({ x: 0, y: 0, k: 1 });
  const [scaleDisplay, setScaleDisplay] = useState(1);
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  // Load Bookmarks
  useEffect(() => {
      const loadBookmarks = async () => {
         const marks = await dbGetBookmarksForBook(book.id);
         setBookmarks(new Set(marks));
      };
      loadBookmarks();
  }, [book.id]);

  // Update External Menu State
  useEffect(() => {
      onBookmarkStatusChange(bookmarks.has(currentPage));
  }, [bookmarks, currentPage, onBookmarkStatusChange]);

  // Register bookmark action to menu
  useEffect(() => {
      onRegisterBookmarkAction(async () => {
          const newSet = new Set(bookmarks);
          if (newSet.has(currentPage)) {
              newSet.delete(currentPage);
              await dbRemoveBookmark(book.id, currentPage);
          } else {
              newSet.add(currentPage);
              await dbAddBookmark(book.id, currentPage);
          }
          setBookmarks(newSet);
          if(settings.enableSfx) playClickSfx();
      });
  }, [bookmarks, currentPage, book.id, settings.enableSfx, onRegisterBookmarkAction]);

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

  // Update Progress / Stamp
  useEffect(() => {
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

  const navigate = useCallback((direction: 'next' | 'prev') => {
      if (settings.viewMode === 'vertical' || settings.viewMode === 'grid') return;
      
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
      }
  }, [currentPage, totalPages, settings, resetZoom]);

  const wheelTimeout = useRef<any>(null);

  const handleWheel = (e: React.WheelEvent) => {
      // 1. PINCH ZOOM (Trackpad sends ctrlKey + wheel)
      if (e.ctrlKey) {
          e.preventDefault();
          const zoomSensitivity = 0.005;
          const delta = -e.deltaY * zoomSensitivity;
          const oldScale = transform.current.k;
          let newScale = oldScale + delta * oldScale; 
          newScale = Math.min(Math.max(0.5, newScale), 5); 
          transform.current.k = newScale;
          if (newScale <= 1) { transform.current.x = 0; transform.current.y = 0; }
          updateTransform();
          return;
      } 
      
      // 2. PANNING (If zoomed in)
      if (transform.current.k > 1) {
         e.preventDefault();
         transform.current.x -= e.deltaX;
         transform.current.y -= e.deltaY;
         updateTransform();
         return;
      }
      
      // 3. PAGE TURN / NAVIGATION (If not zoomed in, vertical scroll)
      // Works for Single and Spread modes
      if (settings.viewMode !== 'vertical' && settings.viewMode !== 'grid') {
          if (Math.abs(e.deltaY) > 30) {
             if (wheelTimeout.current) return;
             
             // Inverted logic for natural scroll: Scroll Down -> Next Page
             const isNext = e.deltaY > 0;
             const isPrev = e.deltaY < 0;

             if (isNext) navigate(settings.direction === 'LTR' ? 'next' : 'prev');
             if (isPrev) navigate(settings.direction === 'LTR' ? 'prev' : 'next');

             wheelTimeout.current = setTimeout(() => { wheelTimeout.current = null; }, 500);
          }
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if(isDragging.current && contentRef.current) {
          e.preventDefault();
          const dx = e.clientX - startPos.current.x;
          const dy = e.clientY - startPos.current.y;
          transform.current.x += dx;
          transform.current.y += dy;
          startPos.current = { x: e.clientX, y: e.clientY };
          updateTransform();
      }
  };

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
                  <div className="absolute top-0 right-4 w-6 h-10 bg-[var(--accent)] shadow-lg z-20 flex items-end justify-center pb-1 mix-blend-multiply opacity-80">
                      <BookmarkIcon className="w-3 h-3 text-[var(--bg-card)] fill-current mb-1" />
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

  // --- RENDER ---
  return (
    <div 
      className={`fixed inset-0 z-50 bg-[var(--bg-main)] flex flex-row text-[var(--text-main)] select-none overflow-hidden transition-all duration-300 ${isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
      onWheel={handleWheel}
      onMouseDown={(e) => { if(e.button===0){ isDragging.current=true; startPos.current={x:e.clientX, y:e.clientY}; } }}
      onMouseMove={handleMouseMove}
      onMouseUp={() => isDragging.current=false}
    >
      
      {/* Thumbnail Scrubber (Left) */}
      <ThumbnailScrubber 
        pages={isPdf ? Array.from({length: totalPages}) : book.pages}
        currentPage={currentPage}
        onJump={setCurrentPage}
        pdfDoc={pdfDoc}
        isPdf={isPdf}
      />

      {/* Main Viewport */}
      <div className={`relative flex-1 w-full h-full overflow-hidden pl-16 ${scaleDisplay > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}>
          
          {/* GRID MODE */}
          {settings.viewMode === 'grid' && (
              <div className="w-full h-full overflow-y-auto p-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {Array.from({ length: totalPages }).map((_, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                            setCurrentPage(idx);
                            onSettingChange('viewMode', 'single');
                        }}
                        className={`relative aspect-[2/3] bg-[var(--bg-card)] cursor-pointer group rounded overflow-hidden border ${currentPage === idx ? 'border-[var(--accent)]' : 'border-[var(--border-color)] hover:border-[var(--text-main)]'}`}
                      >
                         {Math.abs(currentPage - idx) < 50 && renderContent(idx, true)}
                         {bookmarks.has(idx) && <div className="absolute top-2 right-2 text-[var(--accent)]"><BookmarkIcon className="w-4 h-4 fill-current"/></div>}
                         <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] p-1 text-center opacity-0 group-hover:opacity-100">
                             {idx + 1}
                         </div>
                      </div>
                  ))}
              </div>
          )}

          {/* VERTICAL MODE */}
          {settings.viewMode === 'vertical' && (
              <div className="w-full h-full overflow-y-auto" onScroll={(e) => {
                 const el = e.target as HTMLElement;
                 // Calculate simplified index based on scroll pos
                 const index = Math.min(totalPages - 1, Math.max(0, Math.floor((el.scrollTop / el.scrollHeight) * totalPages)));
                 // Only update if significantly changed to avoid jitter, or rely on intersection observer (simplified here)
              }}>
                 {Array.from({ length: totalPages }).map((_, idx) => (
                    <div key={idx} data-index={idx} className="page-container flex justify-center mb-8 min-h-[50vh]">
                       {Math.abs(currentPage - idx) < 5 && renderContent(idx, true)}
                    </div>
                 ))}
                 {showStamp && (
                    <div className="flex justify-center pb-24">
                        <div className="hanko-seal w-48 h-48 rounded-full border-4 border-red-800 flex flex-col items-center justify-center text-red-800 rotate-[-15deg] backdrop-blur-sm bg-red-50/10">
                             <span className="text-4xl font-serif font-bold">READ</span>
                        </div>
                    </div>
                 )}
              </div>
          )}

          {/* SINGLE / SPREAD MODE */}
          {(settings.viewMode === 'single' || settings.viewMode === 'spread') && (
              <div className="w-full h-full flex items-center justify-center perspective-2000" onDoubleClick={resetZoom}>
                  <div
                     ref={contentRef}
                     className={`relative w-full h-full flex items-center justify-center flip-container ${getFlipClass()}`}
                     style={{ transformOrigin: 'center center' }}
                  >
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
              </div>
          )}
      </div>
    </div>
  );
};
