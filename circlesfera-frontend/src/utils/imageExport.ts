export async function exportEditedImage(
  file: File,
  filterString: string,
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
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(file); // fallback
      }

      if (finalFilter) {
        ctx.filter = finalFilter;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
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
