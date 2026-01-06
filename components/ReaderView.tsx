
import React, { useEffect, useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { Book, FileHandle, ReaderSettings } from '../types';
import { getFileUrl } from '../services/fileSystem';
import { Bookmark as BookmarkIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import * as pdfjsLibProxy from 'pdfjs-dist';
import { playClickSfx, playPageTurnSfx, playThumpSfx } from '../services/audio';
import { dbAddBookmark, dbRemoveBookmark, dbGetBookmarksForBook } from '../services/db';

const pdfjsLib: any = (pdfjsLibProxy as any).default || pdfjsLibProxy;
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

export interface ReaderViewHandle {
    toggleBookmark: () => Promise<void>;
}

interface ReaderViewProps {
  book: Book;
  onClose: () => void;
  onUpdateProgress: (bookId: string, pageIndex: number, totalPages: number) => void;
  settings: ReaderSettings;
  onSettingChange: (k: keyof ReaderSettings, v: any) => void;
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
                
                const viewport = page.getViewport({ scale: 2 }); // High res for zoom
                const canvas = canvasRef.current!;
                
                // Avoid canvas memory limit crashes by limiting max dimensions if needed
                // For now, standard resizing
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                const context = canvas.getContext('2d');
                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                }
                
                renderTaskRef.current = page.render({ canvasContext: context, viewport: viewport });
                await renderTaskRef.current.promise;
            } catch (e: any) {
                // Ignore cancel errors
            }
        };
        render();
        
        return () => { 
            active = false; 
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel(); 
                renderTaskRef.current = null;
            }
            // Clear canvas to free memory immediately
            if (canvasRef.current) {
                canvasRef.current.width = 1;
                canvasRef.current.height = 1;
            }
        };
    }, [pdfDoc, pageIndex, isActive]);

    return <canvas ref={canvasRef} className={`bg-white shadow-sm pointer-events-none ${className}`} style={{ width: '100%', height: 'auto' }} />;
});

const LazyImagePage: React.FC<{ handle: FileHandle; isActive: boolean; alt: string; className?: string; style?: React.CSSProperties }> = React.memo(({ handle, isActive, alt, className, style }) => {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        if (!isActive) { 
            if(src) { 
                URL.revokeObjectURL(src); 
                setSrc(null); 
            } 
            return; 
        }

        let active = true;
        getFileUrl(handle).then(url => { 
            if(active) {
                setSrc(url);
            } else {
                URL.revokeObjectURL(url);
            }
        });

        return () => { 
            active = false; 
            // We rely on the next effect cycle or parent unmount to cleanup, 
            // but explicitly cleaning up here is safer for memory.
        };
    }, [handle, isActive]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (src) URL.revokeObjectURL(src);
        };
    }, [src]);

    if (!src) return <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] bg-[var(--bg-card)]/10"><div className="w-8 h-8 rounded-full border-2 border-t-[var(--accent)] animate-spin"/></div>;
    return <img src={src} alt={alt} className={`${className} pointer-events-none select-none`} style={style} loading="eager" decoding="async" />;
});

// Left Sidebar Thumbnail Scrubber
const ThumbnailScrubber: React.FC<{ 
    pages: any[]; 
    currentPage: number; 
    onJump: (idx: number) => void;
    pdfDoc: any; 
    isPdf: boolean;
}> = ({ pages, currentPage, onJump, pdfDoc, isPdf }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div 
            className="fixed left-0 top-0 bottom-0 z-[60] flex group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Trigger Zone */}
            <div className="w-6 h-full bg-transparent group-hover:bg-[var(--bg-main)]/10 transition-colors duration-300"></div>
            
            {/* Drawer */}
            <div className={`w-24 bg-[var(--bg-main)]/95 backdrop-blur-md border-r border-[var(--border-color)] transition-all duration-300 ease-[var(--ease-out-expo)] overflow-y-auto overflow-x-hidden scrollbar-hide flex flex-col items-center py-4 gap-2 absolute left-0 top-0 bottom-0 ${isHovered ? 'translate-x-0 opacity-100 shadow-2xl' : '-translate-x-full opacity-0'}`}>
                {pages.map((p, idx) => {
                    // Only render thumbnails close to current page OR if the drawer is hovered
                    // This saves massive memory
                    const shouldRender = isHovered && Math.abs(currentPage - idx) < 20;

                    return (
                        <div 
                            key={idx} 
                            onClick={() => onJump(idx)}
                            className={`relative w-16 h-24 flex-shrink-0 cursor-pointer rounded overflow-hidden border transition-all duration-300 ${idx === currentPage ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20' : 'border-transparent hover:border-[var(--text-muted)]'}`}
                        >
                            {shouldRender && (
                                isPdf ? (
                                    <div className="w-full h-full bg-white text-[8px] text-black flex items-center justify-center">PDF</div> 
                                ) : (
                                    <LazyImagePage handle={p.handle} isActive={true} alt={`Pg ${idx}`} className="w-full h-full object-cover" />
                                )
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] text-white font-mono font-bold">
                                {idx + 1}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const ReaderView = forwardRef<ReaderViewHandle, ReaderViewProps>(({ 
    book, onClose, onUpdateProgress, settings, onSettingChange, 
    onBookmarkStatusChange 
}, ref) => {
  const [currentPage, setCurrentPage] = useState(() => book.readingProgress?.currentPageIndex || 0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfPages, setPdfPages] = useState<number>(0);
  const isPdf = book.format === 'pdf';
  const totalPages = isPdf ? pdfPages : book.pages.length;
  
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [isClosing, setIsClosing] = useState(false);
  
  // Transition State
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState<'enter' | 'exit' | 'idle'>('idle');
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

  // Sync bookmark status with parent for UI
  useEffect(() => {
      onBookmarkStatusChange(bookmarks.has(currentPage));
  }, [currentPage, bookmarks, onBookmarkStatusChange]);

  // Expose toggleBookmark to parent via ref
  useImperativeHandle(ref, () => ({
      toggleBookmark: async () => {
          const currentSet = new Set(bookmarks);
          const isMarked = currentSet.has(currentPage);
          
          if (isMarked) {
              currentSet.delete(currentPage);
              await dbRemoveBookmark(book.id, currentPage);
          } else {
              currentSet.add(currentPage);
              await dbAddBookmark(book.id, currentPage);
          }
          
          setBookmarks(currentSet);
      }
  }));

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
      if (settings.viewMode === 'vertical' || settings.viewMode === 'grid') {
          // For vertical, we ideally scroll. But if keyboard used, we can jump pages.
          let delta = direction === 'next' ? 1 : -1;
          const next = Math.min(Math.max(0, currentPage + delta), totalPages - 1);
          setCurrentPage(next);
          // Scroll into view logic handled by the render loop
          const el = document.querySelector(`[data-index="${next}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
      }
      
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
          
          setIsTransitioning(true);
          setTransitionPhase('exit'); // Start exit anim
          resetZoom();

          // Duration depends on mode
          const duration = settings.transitionMode === 'smooth' ? 300 : 50; // Faster for snap/none

          setTimeout(() => {
              setCurrentPage(next);
              setTransitionPhase('enter'); // Start enter anim
              requestAnimationFrame(() => {
                 setTimeout(() => {
                     setTransitionPhase('idle');
                     setIsTransitioning(false);
                 }, duration);
              });
          }, duration);
      }
  }, [currentPage, totalPages, settings, resetZoom]);

  // Keyboard Support
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft') {
              navigate(settings.direction === 'LTR' ? 'prev' : 'next');
          } else if (e.key === 'ArrowRight') {
              navigate(settings.direction === 'LTR' ? 'next' : 'prev');
          } else if (e.key === 'Escape') {
              onClose();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, settings.direction, onClose]);

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
      
      // 3. PAGE TURN (Vertical scroll when NOT zoomed)
      if (settings.viewMode !== 'vertical' && settings.viewMode !== 'grid') {
          if (Math.abs(e.deltaY) > 30) {
             if (wheelTimeout.current) return;
             
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
                  <div className="absolute top-0 right-8 w-8 h-12 bg-red-600 shadow-lg z-20 flex items-end justify-center pb-2 animate-in fade-in slide-in-from-top-4 duration-300">
                      <BookmarkIcon className="w-4 h-4 text-white fill-current" />
                      <div className="absolute -bottom-4 left-0 w-0 h-0 border-l-[16px] border-l-red-600 border-r-[16px] border-r-red-600 border-b-[16px] border-b-transparent"></div>
                  </div>
              )}
          </div>
      );
  };

  const getTransitionClass = () => {
      if (!isTransitioning || settings.transitionMode === 'none') return '';
      // Map modes to CSS classes defined in index.html
      // .fx-snap-enter, .fx-smooth-enter, etc.
      const mode = settings.transitionMode;
      return `fx-${mode}-${transitionPhase}`;
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
      <div className={`relative flex-1 w-full h-full overflow-hidden pl-0 ${scaleDisplay > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}>
          
          {/* CLICK ZONES FOR NAVIGATION (Invisible) */}
          {(settings.viewMode === 'single' || settings.viewMode === 'spread') && (
              <>
                <div 
                    className="absolute top-0 bottom-0 left-0 w-[15%] z-40 cursor-w-resize"
                    onClick={(e) => { e.stopPropagation(); navigate('prev'); }}
                    title="Previous Page"
                />
                <div 
                    className="absolute top-0 bottom-0 right-0 w-[15%] z-40 cursor-e-resize"
                    onClick={(e) => { e.stopPropagation(); navigate('next'); }}
                    title="Next Page"
                />
              </>
          )}

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
                         {Math.abs(currentPage - idx) < 20 && renderContent(idx, true)}
                         {bookmarks.has(idx) && <div className="absolute top-2 right-2 text-red-500"><BookmarkIcon className="w-4 h-4 fill-current"/></div>}
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
                 const index = Math.min(totalPages - 1, Math.max(0, Math.floor((el.scrollTop / el.scrollHeight) * totalPages)));
                 if (Math.abs(index - currentPage) > 0) setCurrentPage(index);
              }}>
                 {Array.from({ length: totalPages }).map((_, idx) => (
                    <div key={idx} data-index={idx} className="page-container flex justify-center mb-8 min-h-[50vh]">
                       {Math.abs(currentPage - idx) < 3 && renderContent(idx, true)}
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
                     className={`relative w-full h-full flex items-center justify-center ${getTransitionClass()}`}
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
});
