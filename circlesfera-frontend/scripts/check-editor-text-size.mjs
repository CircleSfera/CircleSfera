// No text in the content editor is smaller than 12 px, the caption size of
// the design tokens. Fails on a Tailwind size written by hand below it
// (`text-[11px]`, `text-[0.6rem]`) and on an inline `fontSize` below it.
// Runs with `npm run lint`; kept out of the test suite so it does not count
// towards coverage.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_PX = 12;
const src = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src',
);

// The editor: the post, frame and story composer, the photo editor and the
// edits studio.
const roots = [
  'components/ContentComposerPage.tsx',
  'components/PhotoEditor.tsx',
  'components/CanvasOverlay.tsx',
  'components/create-post',
  'components/photo-editor',
  'components/story',
  'components/studio',
  'pages/EditsStudio.tsx',
].map((p) => path.join(src, p));

function sourceFiles(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isFile()) return [p];
  return readdirSync(p, { withFileTypes: true }).flatMap((e) => {
    const child = path.join(p, e.name);
    if (e.isDirectory()) return sourceFiles(child);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
      ? [child]
      : [];
  });
}

const toPx = (value, unit) =>
  unit === 'px' ? Number(value) : Number(value) * 16;

const files = roots.flatMap(sourceFiles);
const small = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const where = `${path.relative(src, file)}:${i + 1}`;
    for (const m of line.matchAll(/\btext-\[(\d*\.?\d+)(px|rem)\]/g)) {
      if (toPx(m[1], m[2]) < MIN_PX) small.push(`${where}: ${m[0]}`);
    }
    for (const m of line.matchAll(
      /\bfontSize:\s*['"`]?(\d*\.?\d+)(px|rem)?\b/g,
    )) {
      if (toPx(m[1], m[2] ?? 'px') < MIN_PX) small.push(`${where}: ${m[0]}`);
    }
  });
}

if (small.length) {
  console.error(
    `Text under ${MIN_PX} px in the editor:\n  ${small.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(
  `editor text size: ${files.length} files checked, nothing under ${MIN_PX} px.`,
);
