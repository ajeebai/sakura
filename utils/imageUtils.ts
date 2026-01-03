export const generateThumbnail = async (file: File, maxWidth = 300): Promise<Blob> => {
  // Create an ImageBitmap from the file which is efficient and supports various formats
  const bitmap = await createImageBitmap(file);
  
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
