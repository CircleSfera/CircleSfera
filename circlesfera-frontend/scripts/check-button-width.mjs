// A button is as wide as its label (src/components/ui/buttonWidth.ts). Fails
// on a button stretched to fill its row with `flex-1`, or made full width on a
// phone only with `max-sm:w-full`: a pair of actions uses BUTTON_PAIR, a lone
// one BUTTON_FIT. Two kinds of button are not actions and keep the width of
// their container: a row of a list (its words to the left, or spread with
// `justify-between`), and one choice of a segmented control or a tab bar,
// which says whether it is chosen (`role="tab"`, `aria-pressed`,
// `aria-checked`, `aria-selected`).
// Runs with `npm run lint`; kept out of the test suite so it does not count
// towards coverage.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src',
);

// Full width on purpose, as the platform does it.
const ALLOWED = new Map([
  [
    'components/profile/ProfileHeader.tsx',
    'Follow and Message share a profile’s row, as on every social app',
  ],
  [
    'components/story/StoryShareRow.tsx',
    'on a phone, Your story and Close friends fill the bar under a new story',
  ],
]);

// `flex-1` at any breakpoint (`sm:flex-1`, `md:flex-1` too).
const STRETCHED =
  /(^|[\s`'"])((?:[a-z0-9-]+:)*flex-1|max-sm:w-full)(?=[\s`'"]|$)/;
const LIST_ROW = /\b(text-left|text-start|justify-between)\b/;
const CHOICE = /\b(role="tab"|aria-pressed=|aria-checked=|aria-selected=)/;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const child = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(child);
    return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [child] : [];
  });
}

// The opening tag from `<button` or `<Button` to its `>`, skipping the `>` of
// an arrow function or a comparison inside braces and strings.
function openingTag(text, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return text.slice(from, i);
  }
  return text.slice(from);
}

const files = sourceFiles(src);
const stretched = [];
for (const file of files) {
  const rel = path.relative(src, file).split(path.sep).join('/');
  if (ALLOWED.has(rel)) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/<(button|Button)\b/g)) {
    const tag = openingTag(text, m.index);
    const classes = tag.match(/className=(\{[\s\S]*\}|"[^"]*")/)?.[1] ?? '';
    if (
      STRETCHED.test(classes) &&
      !LIST_ROW.test(classes) &&
      !CHOICE.test(tag)
    ) {
      const line = text.slice(0, m.index).split('\n').length;
      stretched.push(`${rel}:${line}`);
    }
  }
}

if (stretched.length) {
  console.error(
    `Buttons stretched across their row (use BUTTON_PAIR or BUTTON_FIT):\n  ${stretched.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(
  `button width: ${files.length} files checked, no button stretched across its row.`,
);
