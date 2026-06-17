import type { CropData } from '../components/PhotoEditor';

export async function exportEditedImage(
  file: File,
  filterString: string,
  cropData?: CropData,
  overlayDataUrl?: string,
): Promise<File> {
  return new Promise((resolve, reject) => {
    // 1. Parse the filter string
    // Format is like "filter-class:Gingham__style:brightness(105%) contrast(90%)__temp:120__vignette:50__noise:20"
    let tailwindClasses = '';
    let inlineStyle = '';
    let temperature = 100;
    let vignette = 0;
    let noise = 0;

    const parts = filterString.split('__style:');
    if (parts.length > 1) {
      tailwindClasses = parts[0].replace('filter-class:', '');
      const subparts = parts[1].split('__temp:');
      inlineStyle = subparts[0];
      if (subparts.length > 1) {
        const tempParts = subparts[1].split('__vignette:');
        temperature = Number(tempParts[0]);
        if (tempParts.length > 1) {
          const vigParts = tempParts[1].split('__noise:');
          vignette = Number(vigParts[0]);
          if (vigParts.length > 1) noise = Number(vigParts[1]);
        }
      }
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

      // PRO Adjustments:
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for overlays

      // 1. Temperature
      if (temperature !== 100) {
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = temperature > 100 ? '#ff8c00' : '#0077ff';
        ctx.globalAlpha = Math.abs(temperature - 100) / 300;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
      }

      // 2. Vignette
      if (vignette > 0) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const r = Math.max(cx, cy);
        const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.2);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.globalAlpha = vignette / 100;
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
      }

      // 3. Noise
      const drawNoise = (onDone: () => void) => {
        if (noise > 0) {
          const noiseSvg = `data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E`;
          const noiseImg = new Image();
          noiseImg.onload = () => {
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = noise / 100;
            const pat = ctx.createPattern(noiseImg, 'repeat');
            if (pat) {
              ctx.fillStyle = pat;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
            onDone();
          };
          noiseImg.onerror = onDone;
          noiseImg.src = noiseSvg;
        } else {
          onDone();
        }
      };

      const processCropAndExport = () => {
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
          targetHeight,
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

      if (overlayDataUrl) {
        const overlayImg = new Image();
        overlayImg.onload = () => {
          // Re-apply original transform for the overlay? No, overlay is already absolute positioned based on naturalWidth
          // Wait, overlay in PhotoEditor is drawn on top of the already rotated/cropped view?
          // No, CanvasOverlay in PhotoEditor is absolute and matches imageDims.
          // Wait, the original code had:
          // ctx.drawImage(overlayImg, 0, 0, img.naturalWidth, img.naturalHeight);
          // Which was BEFORE reset transform! But now we did ctx.setTransform(1, 0, 0, 1, 0, 0);
          // Let's re-apply the rotation just for the overlay to match old behavior
          ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
          ctx.rotate(rotRad);
          ctx.translate(-img.naturalWidth / 2, -img.naturalHeight / 2);

          ctx.drawImage(overlayImg, 0, 0, img.naturalWidth, img.naturalHeight);

          ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset again

          drawNoise(processCropAndExport);
        };
        overlayImg.onerror = () => {
          drawNoise(processCropAndExport); // fallback if overlay fails
        };
        overlayImg.src = overlayDataUrl;
      } else {
        drawNoise(processCropAndExport);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for export.'));
    img.src = URL.createObjectURL(file);
  });
}
