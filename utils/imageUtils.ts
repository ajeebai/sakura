import JSZip from 'jszip';
import * as pdfjsLibProxy from 'pdfjs-dist';
import { isImage, naturalSort } from './fileUtils';

// Initialize PDF.js worker
const pdfjsLib: any = (pdfjsLibProxy as any).default || pdfjsLibProxy;
if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

export const generateThumbnail = async (file: File, maxWidth = 300): Promise<Blob> => {
  // Create an ImageBitmap from the file which is efficient and supports various formats
  let bitmap: ImageBitmap;
  try {
      bitmap = await createImageBitmap(file);
  } catch (e) {
      console.warn("createImageBitmap failed, falling back to blob url load", e);
      return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
              // Draw to canvas directly
              const scale = maxWidth / img.width;
              const width = maxWidth;
              const height = img.height * scale;
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if(ctx) {
                  ctx.drawImage(img, 0, 0, width, height);
                  canvas.toBlob(b => b ? resolve(b) : reject(new Error('Thumb failed')), 'image/jpeg', 0.7);
              } else {
                  reject(new Error('Canvas context missing'));
              }
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
      });
  }
  
  // Calculate aspect ratio
  const scale = maxWidth / bitmap.width;
  const width = maxWidth;
  const height = bitmap.height * scale;

  // Create an off-screen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  // Draw and resize
  ctx.drawImage(bitmap, 0, 0, width, height);
  
  // Convert to Blob (JPEG 70% quality is a good balance for thumbnails)
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Thumbnail generation failed'));
    }, 'image/jpeg', 0.7);
  });
};

export const generatePdfThumbnail = async (file: File, maxWidth = 300): Promise<Blob> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1); // Page 1
    
    // Calculate scale
    const viewport = page.getViewport({ scale: 1 });
    const scale = maxWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const context = canvas.getContext('2d');

    if (!context) throw new Error("Canvas context missing");

    await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
    
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('PDF Thumbnail failed'));
        }, 'image/jpeg', 0.7);
    });
};

export const generateArchiveThumbnail = async (file: File, maxWidth = 300): Promise<Blob> => {
    try {
        const zip = await JSZip.loadAsync(file);
        
        // Find first image
        let coverEntry: any = null;
        const fileNames = Object.keys(zip.files).sort(naturalSort); 
        
        for (const name of fileNames) {
            // Ignore MACOSX artifacts and directories
            if (!zip.files[name].dir && isImage(name) && !name.includes('__MACOSX') && !name.startsWith('.')) {
                coverEntry = zip.files[name];
                break;
            }
        }

        if (!coverEntry) throw new Error("No images found in archive");

        const blob = await coverEntry.async('blob');
        const imageFile = new File([blob], coverEntry.name, { type: 'image/jpeg' });
        return generateThumbnail(imageFile, maxWidth);

    } catch (e) {
        console.warn("Archive thumb generation failed (likely unsupported format like RAR)", e);
        throw e;
    }
};