import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROBOTO_FONTS = [
  {
    name: 'Roboto-Regular.ttf',
    url: 'https://cdn.jsdelivr.net/gh/googlefonts/roboto@v2.138/src/hinted/Roboto-Regular.ttf',
  },
  {
    name: 'Roboto-Bold.ttf',
    url: 'https://cdn.jsdelivr.net/gh/googlefonts/roboto@v2.138/src/hinted/Roboto-Bold.ttf',
  },
] as const;

/**
 * Copy @ffmpeg/core into public/ffmpeg (and Roboto for Studio export)
 * so Studio / create-post worker load same-origin assets — no unpkg CDN.
 */
export function copyStudioMediaAssets(): Plugin {
  const sync = async () => {
    const ffmpegDest = resolve(__dirname, 'public/ffmpeg');
    mkdirSync(ffmpegDest, { recursive: true });
    const ffmpegSrc = resolve(__dirname, 'node_modules/@ffmpeg/core/dist/esm');
    for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm'] as const) {
      const from = resolve(ffmpegSrc, file);
      const to = resolve(ffmpegDest, file);
      if (existsSync(from)) {
        copyFileSync(from, to);
      }
    }

    const fontsDest = resolve(__dirname, 'public/fonts');
    mkdirSync(fontsDest, { recursive: true });
    for (const font of ROBOTO_FONTS) {
      const fontFile = resolve(fontsDest, font.name);
      if (existsSync(fontFile)) continue;
      try {
        const res = await fetch(font.url);
        if (res.ok) {
          writeFileSync(fontFile, Buffer.from(await res.arrayBuffer()));
        }
      } catch {
        // Export text falls back without custom font
      }
    }
  };

  return {
    name: 'copy-studio-media-assets',
    async buildStart() {
      await sync();
    },
    async configureServer() {
      await sync();
    },
  };
}
