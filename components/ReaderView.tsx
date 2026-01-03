
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Book, FileHandle, ReaderSettings } from '../types';
import { getFileUrl } from '../services/fileSystem';
import { ArrowLeft, AlignJustify, Bookmark as BookmarkIcon } from 'lucide-react';
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

// --- Reader View Main ---

const PdfPage: React.FC<{ pdfDoc: any; pageIndex: number; scale: number; isActive: boolean; className?: string }> = React.memo(({ pdfDoc, pageIndex, scale, isActive, className }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<any>(null);
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
            } catch (e: any) { }
        };
        render();
        return () => { active = false; if (renderTaskRef.current) renderTaskRef.current.cancel(); };
    }, [pdfDoc, pageIndex, scale, isActive]);
    return <canvas ref={canvasRef} className={`bg-white shadow-sm ${className}`} />;
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
    return <img src={src} alt={alt} className={className} style={style} />;
});

export const ReaderView: React.FC<ReaderViewProps> = ({ book, onClose, onUpdateProgress, settings }) => {
  const [currentPage, setCurrentPage] = useState(() => book.readingProgress?.currentPageIndex || 0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfPages, setPdfPages] = useState<number>(0);
  const isPdf = book.format === 'pdf';
  const totalPages = isPdf ? pdfPages : book.pages.length;
  const [isBookmarked, setIsBookmarked] = useState(false);
  
  const transform = useRef({ scale: 1, panX: 0, panY: 0 });
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scaleDisplay, setScaleDisplay] = useState(1);
  const [isClosing, setIsClosing] = useState(false);
  
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipPhase, setFlipPhase] = useState<'out' | 'in-start' | 'in-end' | 'idle'>('idle');
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next');
  const [showStamp, setShowStamp] = useState(false);

  // Digital Patina: Increase read count on mount
  useEffect(() => {
     const inc = async () => {
         // Simple atomic increment is complex with current DB, so just optimistic update
         const current = book.readCount || 0;
         await dbUpdateBook({ ...book, readCount: current + 1, handle: undefined, pages: undefined, coverHandle: undefined } as any);
     };
     inc();
  }, []);

  useEffect(() => {
      const checkBookmark = async () => {
         const marks = await dbGetBookmarksForBook(book.id);
         setIsBookmarked(marks.includes(currentPage));
      };
      checkBookmark();
  }, [book.id, currentPage]);

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

  useEffect(() => {
      if (totalPages > 0) {
          const t = setTimeout(() => onUpdateProgress(book.id, currentPage, totalPages), 500);
          return () => clearTimeout(t);
      }
      
      // Completionist Stamp Trigger
      if (totalPages > 0 && currentPage === totalPages - 1 && !showStamp) {
          setTimeout(() => {
              playThumpSfx();
              setShowStamp(true);
          }, 800);
      } else if (currentPage !== totalPages - 1) {
          setShowStamp(false);
      }
  }, [currentPage, book.id, totalPages]);

  const toggleBookmark = async () => {
      if (isBookmarked) {
          await dbRemoveBookmark(book.id, currentPage);
          setIsBookmarked(false);
      } else {
          await dbAddBookmark(book.id, currentPage);
          setIsBookmarked(true);
      }
      if(settings.enableSfx) playClickSfx();
  };

  const resetTransform = useCallback(() => {
      transform.current = { scale: 1, panX: 0, panY: 0 };
      if (contentRef.current) {
          contentRef.current.style.transform = `translate(0px, 0px) scale(1)`;
      }
      setScaleDisplay(1);
  }, []);

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
          
          setTimeout(() => {
              setCurrentPage(next);
              setFlipPhase('in-start');
              resetTransform();
              
              requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                      setFlipPhase('in-end');
                      setTimeout(() => { 
                          setFlipPhase('idle'); 
                          setIsFlipping(false); 
                      }, 400);
                  });
              });
          }, 400); 
      } else if (direction === 'prev' && next < 0) {
          setIsClosing(true);
          setTimeout(onClose, 300);
      }
  }, [currentPage, totalPages, settings, resetTransform, onClose]);

  const updateContentTransform = () => {
      if (contentRef.current) {
          const { panX, panY, scale } = transform.current;
          contentRef.current.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      }
  };

  const handleDoubleTapZoom = (e: React.MouseEvent) => {
      if (!contentRef.current) return;
      
      // If already zoomed, reset
      if (transform.current.scale > 1) {
          resetTransform();
          return;
      }

      // Calculate Quadrant
      const rect = contentRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const width = rect.width;
      const height = rect.height;
      
      // Target scale
      const targetScale = 2.5;
      
      // Calculate pan to center the click
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      // pan = (center - clickPos) * (scale - 1) ? No, simpler logic for "Smart Zoom"
      // Just shift to the quadrant.
      
      let newPanX = 0;
      let newPanY = 0;
      
      if (x < centerX) newPanX = width * 0.5; // Shift Right to see Left
      else newPanX = -width * 0.5; // Shift Left to see Right
      
      if (y < centerY) newPanY = height * 0.5;
      else newPanY = -height * 0.5;

      // Refined Logic: Pan so the clicked point is centered
      // newPan = (ContainerCenter - ClickedPoint) * Scale
      // But we are transforming the element itself.
      
      // Simply move the clicked quadrant to view
      newPanX = (centerX - x) * targetScale;
      newPanY = (centerY - y) * targetScale;

      // Clamp
      const maxPanX = (width * targetScale - width) / 2;
      const maxPanY = (height * targetScale - height) / 2;
      
      newPanX = Math.max(-maxPanX, Math.min(maxPanX, newPanX));
      newPanY = Math.max(-maxPanY, Math.min(maxPanY, newPanY));

      transform.current = { scale: targetScale, panX: newPanX, panY: newPanY };
      updateContentTransform();
      setScaleDisplay(targetScale);
  };

  const handleWheel = (e: React.WheelEvent) => {
      const { scale } = transform.current;
      if (e.ctrlKey) {
          e.preventDefault();
          const delta = -e.deltaY * 0.005;
          let newScale = Math.min(Math.max(0.1, scale + delta), 5);
          if (newScale < 0.6) {
              setIsClosing(true);
              setTimeout(onClose, 300);
              return;
          }
          if (Math.abs(newScale - 1) < 0.05) newScale = 1;
          transform.current.scale = newScale;
          if (newScale <= 1) { transform.current.panX = 0; transform.current.panY = 0; }
          updateContentTransform();
          setScaleDisplay(newScale);
          return;
      }
      if (scale > 1) {
          e.preventDefault();
          transform.current.panX -= e.deltaX;
          transform.current.panY -= e.deltaY;
          updateContentTransform();
          return;
      }
      if (settings.viewMode !== 'vertical' && Math.abs(e.deltaX) > 50) {
          if (e.deltaX > 0) settings.direction === 'LTR' ? navigate('next') : navigate('prev');
          else settings.direction === 'LTR' ? navigate('prev') : navigate('next');
      }
  };

  const handleClick = (e: React.MouseEvent) => {
      if (transform.current.scale > 1) return;
      if ((e.target as HTMLElement).closest('.thumbnail-sidebar')) return;
      if ((e.target as HTMLElement).closest('button')) return;

      const w = window.innerWidth;
      if (e.clientX < w * 0.3) settings.direction === 'LTR' ? navigate('prev') : navigate('next');
      if (e.clientX > w * 0.7) settings.direction === 'LTR' ? navigate('next') : navigate('prev');
  };

  useEffect(() => {
      if (settings.viewMode !== 'vertical') return;
      const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
              if (entry.isIntersecting) {
                  const index = parseInt(entry.target.getAttribute('data-index') || '0');
                  setCurrentPage(index); 
              }
          });
      }, { rootMargin: '200% 0px 200% 0px' }); 
      const elements = document.querySelectorAll('.page-container');
      elements.forEach(el => observer.observe(el));
      return () => observer.disconnect();
  }, [settings.viewMode, totalPages, book.id]); 

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
      return (
          <div className="w-full h-full flex items-center justify-center backface-hidden">
              {isPdf ? (
                  <PdfPage pdfDoc={pdfDoc} pageIndex={idx + 1} scale={2} isActive={active} className="shadow-2xl max-h-screen max-w-full object-contain" />
              ) : (
                  <LazyImagePage handle={book.pages[idx].handle} isActive={active} alt={`Page ${idx}`} style={getImageStyle()} />
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
      onClick={handleClick}
    >
      {/* Top Controls */}
      <div className={`absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-6 z-30 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none hover:pointer-events-auto`}>
        <div className="flex gap-4">
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/90 backdrop-blur-md border border-white/5 pointer-events-auto">
                <ArrowLeft className="w-5 h-5" />
            </button>
            <button onClick={toggleBookmark} className={`p-2 hover:bg-white/10 rounded-full backdrop-blur-md border border-white/5 pointer-events-auto transition-colors ${isBookmarked ? 'text-[var(--accent)]' : 'text-white/90'}`}>
                <BookmarkIcon className={`w-5 h-5 ${isBookmarked ? 'fill-current' : ''}`} />
            </button>
        </div>
        
        <div className="bg-black/40 backdrop-blur px-3 py-1 rounded-full text-xs font-mono border border-white/10">
            {currentPage + 1} / {totalPages}
        </div>
      </div>

      {/* Main Viewport */}
      <div className={`relative flex-1 w-full h-full overflow-hidden ${scaleDisplay > 1 ? 'cursor-grab' : ''}`}>
          
          {settings.viewMode === 'vertical' ? (
              <div className="w-full h-full overflow-y-auto">
                 {Array.from({ length: totalPages }).map((_, idx) => (
                    <div key={idx} data-index={idx} className="page-container flex justify-center mb-8 min-h-[50vh]">
                       {Math.abs(currentPage - idx) < 5 && renderContent(idx, true)}
                    </div>
                 ))}
                 
                 {/* Hanko Stamp for Vertical Mode */}
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
              <div className="w-full h-full flex items-center justify-center perspective-2000" onDoubleClick={handleDoubleTapZoom}>
                  <div
                     ref={contentRef}
                     className={`relative w-full h-full flex items-center justify-center flip-container ${getFlipClass()}`}
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
                  
                  {/* Hanko Stamp Overlay */}
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

      {/* Thumbnail Filmstrip Scrubber */}
      <div 
        className="thumbnail-sidebar absolute top-0 bottom-0 left-0 w-[110px] -translate-x-full hover:translate-x-0 transition-transform duration-300 z-40 bg-transparent group"
      >
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
