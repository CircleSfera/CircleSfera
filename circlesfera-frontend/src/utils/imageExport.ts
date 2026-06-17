import type { CropData } from '../components/PhotoEditor';

export async function exportEditedImage(
  file: File,
  filterString: string,
  cropData?: CropData,
): Promise<File> {
  return new Promise((resolve, reject) => {
    // 1. Parse the filter string
    // Format is like "filter-class:Gingham__style:brightness(105%) contrast(90%)"
    let tailwindClasses = '';
    let inlineStyle = '';

    const parts = filterString.split('__style:');
    if (parts.length > 1) {
      tailwindClasses = parts[0].replace('filter-class:', '');
      inlineStyle = parts[1];
    }

    // 2. Map tailwind classes to CSS filter
    const classFilters: string[] = [];
    if (tailwindClasses) {
      const classes = tailwindClasses.split(' ');
      for (const cls of classes) {
        if (!cls) continue;
        if (cls === 'grayscale') classFilters.push('grayscale(100%)');
        else if (cls.startsWith('brightness-'))
          classFilters.push(`brightness(${cls.split('-')[1]}%)`);
        else if (cls.startsWith('contrast-'))
          classFilters.push(`contrast(${cls.split('-')[1]}%)`);
        else if (cls.startsWith('saturate-'))
          classFilters.push(`saturate(${cls.split('-')[1]}%)`);
        else if (cls.startsWith('hue-rotate-'))
          classFilters.push(`hue-rotate(${cls.split('rotate-')[1]}deg)`);
        else if (cls.startsWith('sepia-[')) {
          // Extracts .15 -> 15
          const match = cls.match(/sepia-\[\.?(\d+)\]/);
          if (match) {
            classFilters.push(`sepia(${match[1]}%)`);
          }
        }
      }
    }

    const finalFilter = `${classFilters.join(' ')} ${inlineStyle}`.trim();

    // 3. Render onto canvas
    const img = new Image();
    img.onload = () => {
      // First canvas: handle rotation and filtering
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(file);

      // Calculate bounding box for rotated image
      const rotation = cropData?.rotation || 0;
      const rotRad = (rotation * Math.PI) / 180;
      
      const bBoxWidth =
        Math.abs(Math.cos(rotRad) * img.naturalWidth) +
        Math.abs(Math.sin(rotRad) * img.naturalHeight);
      const bBoxHeight =
        Math.abs(Math.sin(rotRad) * img.naturalWidth) +
        Math.abs(Math.cos(rotRad) * img.naturalHeight);

      canvas.width = bBoxWidth;
      canvas.height = bBoxHeight;

      if (finalFilter) {
        ctx.filter = finalFilter;
      }

      ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
      ctx.rotate(rotRad);
      ctx.translate(-img.naturalWidth / 2, -img.naturalHeight / 2);

      ctx.drawImage(img, 0, 0);

      // Second canvas: handle crop
      const finalCanvas = document.createElement('canvas');
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) return resolve(file);

      const targetWidth = cropData ? cropData.width : bBoxWidth;
      const targetHeight = cropData ? cropData.height : bBoxHeight;
      const sx = cropData ? cropData.x : 0;
      const sy = cropData ? cropData.y : 0;

      finalCanvas.width = targetWidth;
      finalCanvas.height = targetHeight;

      finalCtx.drawImage(
        canvas,
        sx,
        sy,
        targetWidth,
        targetHeight,
        0,
        0,
        targetWidth,
        targetHeight
      );

      finalCanvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          const newFile = new File(
            [blob],
            `edited_${file.name.replace(/\.[^/.]+$/, '')}.jpg`,
            {
              type: 'image/jpeg',
              lastModified: Date.now(),
            },
          );
          resolve(newFile);
        },
        'image/jpeg',
        0.95,
      );
    };

    img.onerror = () => reject(new Error('Failed to load image for export.'));
    img.src = URL.createObjectURL(file);
  });
}
