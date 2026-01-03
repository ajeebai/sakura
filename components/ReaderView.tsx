
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
}

// --- Helper Components ---

const PdfThumbnail: React.FC<{
    pdfDoc: any;
    pageIndex: number;
    isActive: boolean;
}> = React.memo(({ pdfDoc, pageIndex, isActive }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<any>(null);

    useEffect(() => {
        if (!isActive || !pdfDoc || !canvasRef.current) return;
        let active = true;
        const render = async () => {
            try {
                const page = await pdfDoc.getPage(pageIndex);
                if (!active) return;
                const viewport = page.getViewport({ scale: 0.15 }); 
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

    return <canvas ref={canvasRef} className="w-full h-auto shadow-sm block bg-white" />;
});

const ThumbnailImage: React.FC<{ 
    handle: FileHandle; 
    isActive: boolean; 
}> = React.memo(({ handle, isActive }) => {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        if (!isActive) { if(src) { URL.revokeObjectURL(src); setSrc(null); } return; }
        let active = true;
        getFileUrl(handle).then(url => { if(active) setSrc(url); });
        return () => { active = false; };
    }, [handle, isActive]);

    if (!src) return <div className="w-full aspect-[2/3] bg-white/5 animate-pulse rounded" />;
    return <img src={src} alt="thumb" className="w-full h-auto shadow-sm block object-cover rounded" />;
});

const ThumbnailStrip: React.FC<{
    book: Book;
    pdfDoc: any;
    totalPages: number;
    currentPage: number;
    onSelectPage: (idx: number) => void;
}> = ({ book, pdfDoc, totalPages, currentPage, onSelectPage }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastScrollTime = useRef(0);

    useEffect(() => {
        if (containerRef.current && Date.now() - lastScrollTime.current > 1000) {
            const activeThumb = containerRef.current.querySelector(`[data-page="${currentPage}"]`);
            if (activeThumb) {
                activeThumb.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [currentPage]);

    const [visibleRange, setVisibleRange] = useState({ start: 0, end: 15 });

    const handleScroll = useCallback(() => {
        if (!containerRef.current) return;
        lastScrollTime.current = Date.now();
        const el = containerRef.current;
        const itemHeight = 100;
        const start = Math.floor(el.scrollTop / itemHeight);
        const count = Math.ceil(el.clientHeight / itemHeight);
        setVisibleRange({ start: Math.max(0, start - 5), end: Math.min(totalPages, start + count + 5) });
    }, [totalPages]);

    useEffect(() => { handleScroll(); }, [handleScroll]);

    return (
        <div 
            ref={containerRef}
            onScroll={handleScroll}
            className="h-full w-full overflow-y-auto overflow-x-hidden p-3 space-y-4 scrollbar-hide bg-black/60 backdrop-blur-md border-r border-white/10"
        >
            {Array.from({ length: totalPages }).map((_, idx) => {
                const isVisible = idx >= visibleRange.start && idx <= visibleRange.end;
                const isCurrent = idx === currentPage;

                return (
                    <div 
                        key={idx} 
                        data-page={idx}
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            onSelectPage(idx); 
                        }}
                        className={`w-full cursor-pointer transition-all duration-200 relative group flex flex-col items-center gap-1 ${isCurrent ? 'opacity-100 scale-100 ring-2 ring-[var(--accent)] rounded' : 'opacity-40 hover:opacity-100 hover:scale-105'}`}
                        style={{ minHeight: '60px' }}
                    >
                        {isVisible ? (
                            book.format === 'pdf' ? (
                                <PdfThumbnail pdfDoc={pdfDoc} pageIndex={idx + 1} isActive={true} />
                            ) : (
                                <ThumbnailImage handle={book.pages[idx].handle} isActive={true} />
                            )
                        ) : (
                             <div className="w-full aspect-[2/3] bg-white/5 rounded" />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// --- Reader Components ---

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

export const ReaderView: React.FC<ReaderViewProps> = ({ book, onClose, onUpdateProgress, settings }) => {
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
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Transform State: x, y, scale
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

  const toggleBookmark = async () => {
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
  };

  // --- Zoom Engine Implementation ---

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

  const handleWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey) {
          e.preventDefault();
          // Zoom
          const zoomSensitivity = 0.002;
          const delta = -e.deltaY * zoomSensitivity;
          const oldScale = transform.current.k;
          let newScale = oldScale + delta * oldScale; // Logarithmic-ish
          newScale = Math.min(Math.max(0.5, newScale), 5); // Limits

          // Zoom towards cursor?
          // For simplicity in this engine, we zoom center, then allow pan.
          // Or we can try to compensate.
          // Simplest robust way:
          
          transform.current.k = newScale;
          
          if (newScale <= 1) {
             transform.current.x = 0;
             transform.current.y = 0;
          }

          updateTransform();
      } else {
          // Pan or Navigation?
          if (transform.current.k > 1) {
             e.preventDefault();
             transform.current.x -= e.deltaX;
             transform.current.y -= e.deltaY;
             updateTransform();
          } else if (Math.abs(e.deltaX) > 50 && settings.viewMode !== 'vertical') {
             // Navigate
             if (e.deltaX > 0) settings.direction === 'LTR' ? navigate('next') : navigate('prev');
             else settings.direction === 'LTR' ? navigate('prev') : navigate('next');
          }
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      isDragging.current = true;
      startPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      
      transform.current.x += dx;
      transform.current.y += dy;
      
      startPos.current = { x: e.clientX, y: e.clientY };
      updateTransform();
  };

  const handleMouseUp = () => {
      isDragging.current = false;
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      if (!contentRef.current) return;
      
      if (transform.current.k > 1.2) {
          resetZoom();
      } else {
          // Zoom to point
          const rect = contentRef.current.getBoundingClientRect();
          const clickX = e.clientX - rect.left; // x position within the element
          const clickY = e.clientY - rect.top;
          
          // Target scale
          const targetK = 2.5;
          
          // Logic: We want (clickX, clickY) to be at the center of the viewport
          // Viewport center relative to element
          const viewportW = window.innerWidth;
          const viewportH = window.innerHeight;
          
          // Current element center is at viewport center because of flex centering
          // We need to shift the element so that clickX becomes center.
          // Offset from center = (elementWidth/2 - clickX)
          
          const elW = rect.width / transform.current.k; // Original width
          const elH = rect.height / transform.current.k;
          
          // Normalized click pos (0..1) relative to image
          const nX = clickX / rect.width;
          const nY = clickY / rect.height;
          
          // New Transform X:
          // Center the point (nX * elW)
          // T = (ViewportW/2) - (nX * elW * targetK)
          // But our transform origin is center... wait, transform origin CSS is usually 50% 50%.
          // Let's assume CSS transform-origin: center center.
          
          // At scale 1, pos is (0,0). Center of image is at center of screen.
          // To move point P to center, we need to translate by (Center - P).
          // P relative to center = (nX - 0.5) * elW * targetK
          // So translate = - (nX - 0.5) * elW * targetK
          
          const shiftX = -1 * (nX - 0.5) * elW * targetK;
          const shiftY = -1 * (nY - 0.5) * elH * targetK;

          transform.current.k = targetK;
          transform.current.x = shiftX;
          transform.current.y = shiftY;
          updateTransform();
      }
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
                      setTimeout(() => { 
                          setFlipPhase('idle'); 
                          setIsFlipping(false); 
                      }, 400);
                  });
              });
          }, 300); // Slightly faster for datamosh feel
      } else if (direction === 'prev' && next < 0) {
          setIsClosing(true);
          setTimeout(onClose, 300);
      }
  }, [currentPage, totalPages, settings, resetZoom, onClose]);

  // --- Rendering ---

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
              
              {/* Bookmark Indicator on Page */}
              {isMarked && (
                  <div className="absolute top-0 right-4 w-6 h-10 bg-red-600 shadow-lg z-20 flex items-end justify-center pb-1">
                      <div className="border-l-[12px] border-r-[12px] border-b-[10px] border-l-transparent border-r-transparent border-b-white/0 absolute bottom-[-10px] w-0 h-0 border-t-[10px] border-t-red-600" />
                      <BookmarkIcon className="w-3 h-3 text-white fill-current mb-1" />
                  </div>
              )}
          </div>
      );
  };

  const getFlipClass = () => {
      if (!isFlipping) return '';
      if (settings.transitionMode === 'datamosh') {
          return 'datamosh-active';
      }
      return flipPhase === 'out' ? 'flip-out' : flipPhase === 'in-start' ? 'flip-in-start' : 'flip-in-end';
  };

  return (
    <div 
      ref={containerRef}
      className={`fixed inset-0 z-50 bg-[var(--bg-main)] flex flex-col text-[var(--text-main)] select-none overflow-hidden transition-all duration-300 ${isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top Controls */}
      <div className={`absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-6 z-30 opacity-0 hover:opacity-100 transition-opacity duration-300`}>
        <div className="flex gap-4">
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/90 backdrop-blur-md border border-white/5 pointer-events-auto">
                <ArrowLeft className="w-5 h-5" />
            </button>
            <button onClick={toggleBookmark} className={`p-2 hover:bg-white/10 rounded-full backdrop-blur-md border border-white/5 pointer-events-auto transition-colors ${bookmarks.has(currentPage) ? 'text-red-500' : 'text-white/90'}`}>
                <BookmarkIcon className={`w-5 h-5 ${bookmarks.has(currentPage) ? 'fill-current' : ''}`} />
            </button>
        </div>
        
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
              <div className="w-full h-full flex items-center justify-center perspective-2000" onDoubleClick={handleDoubleClick}>
                  <div
                     ref={contentRef}
                     className={`relative w-full h-full flex items-center justify-center flip-container ${getFlipClass()}`}
                     style={{ transformOrigin: 'center center' }}
                     data-flip-direction={flipDirection}
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

      {/* Thumbnail Filmstrip */}
      <div className="thumbnail-sidebar absolute top-0 bottom-0 left-0 w-[110px] -translate-x-full hover:translate-x-0 transition-transform duration-300 z-40 bg-transparent group">
          <div className="absolute top-1/2 -right-6 w-6 h-24 -translate-y-1/2 flex items-center justify-center group-hover:opacity-0 transition-opacity cursor-pointer">
              <div className="w-1.5 h-12 bg-[var(--text-muted)]/50 rounded-full" />
          </div>
          <ThumbnailStrip 
             book={book} 
             pdfDoc={pdfDoc} 
             totalPages={totalPages} 
             currentPage={currentPage}
             onSelectPage={(page) => {
                 playClickSfx();
                 setCurrentPage(page);
             }}
          />
      </div>
    </div>
  );
};
