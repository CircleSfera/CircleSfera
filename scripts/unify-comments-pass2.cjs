#!/usr/bin/env node
// Second-pass: convert remaining full-line /* */ and /** */ comments to // Sentence case
// Does not parse regex/strings beyond skipping lines that are clearly not comments.

const fs = require('node:fs');
const path = require('node:path');

const ROOTS = [
  'circlesfera-frontend/src',
  'circlesfera-backend/src',
  'circlesfera-shared/src',
];

const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const PRESERVE_RE =
  /biome-ignore|eslint-|prettier-ignore|@ts-expect-error|@ts-ignore|@ts-nocheck|istanbul ignore|c8 ignore/i;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      ent.name === 'node_modules' ||
      ent.name === 'dist' ||
      ent.name === 'coverage' ||
      ent.name === 'prisma'
    ) {
      continue;
    }
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (EXT.has(path.extname(ent.name))) out.push(p);
  }
  return out;
}

function stripAdr(text) {
  return text
    .replace(/\(?\s*ADR-?\d+\s*\)?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim();
}

function sentenceCase(text) {
  let t = text.trim();
  if (!t) return '';
  t = t.replace(/^[─\-–—=\s]+/, '').replace(/[─\-–—=\s]+$/, '').trim();
  t = stripAdr(t);
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function rewriteInner(inner, isCss) {
  const lines = [];
  for (const raw of inner.split(/\r?\n/)) {
    let line = raw.replace(/^\s*\*\s?/, '').replace(/^\s*\*/, '').trim();
    if (!line) continue;
    if (PRESERVE_RE.test(line)) {
      lines.push(line);
      continue;
    }
    const param = line.match(
      /^@param\s+(?:\{[^}]+\}\s+)?(\S+)\s*(?:-\s*)?(.*)$/i,
    );
    if (param) {
      const desc = param[2]?.trim();
      line = desc ? `Param ${param[1]}: ${desc}` : `Param ${param[1]}`;
    } else if (/^@returns?\b/i.test(line)) {
      line = line.replace(/^@returns?\s*(?:\{[^}]+\}\s*)?/i, 'Returns ').trim();
    } else if (/^@deprecated\b/i.test(line)) {
      line = line.replace(/^@deprecated\s*/i, 'Deprecated: ').trim();
    } else if (/^@\w+/.test(line)) {
      line = line.replace(/^@(\w+)\s*/i, (_, tag) => `${tag}: `);
    }
    const sc = sentenceCase(line);
    if (sc) lines.push(sc);
  }
  return lines;
}

function processTs(source) {
  const lines = source.split('\n');
  const out = [];
  let i = 0;
  let changed = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // JSX preserve/normalize: {/* ... */}
    const jsx = line.match(/^(\s*)\{\/\*([\s\S]*?)\*\/\}\s*$/);
    if (jsx) {
      if (PRESERVE_RE.test(line)) {
        out.push(line);
        i++;
        continue;
      }
      const docs = rewriteInner(jsx[2]);
      const text = docs.join(' ') || sentenceCase(jsx[2]);
      const next = text ? `${jsx[1]}{/* ${text} */}` : `${jsx[1]}`;
      if (next !== line) changed = true;
      out.push(next);
      i++;
      continue;
    }

    // Full-line single block comment: /* ... */ or /** ... */
    const single = line.match(/^(\s*)\/\*\*?([\s\S]*?)\*\/\s*$/);
    if (single && !PRESERVE_RE.test(line)) {
      const docs = rewriteInner(single[2]);
      if (docs.length === 0) {
        changed = true;
        i++;
        continue;
      }
      for (const d of docs) {
        out.push(`${single[1]}// ${d}`);
      }
      changed = true;
      i++;
      continue;
    }

    // Multi-line /** or /* starting on its own line
    const start = line.match(/^(\s*)\/\*\*?(.*)$/);
    if (start && !trimmed.endsWith('*/') && !PRESERVE_RE.test(line)) {
      const indent = start[1];
      const buf = [start[2]];
      i++;
      while (i < lines.length) {
        const L = lines[i];
        const end = L.match(/^(.*?)\*\/\s*$/);
        if (end) {
          buf.push(end[1]);
          i++;
          break;
        }
        buf.push(L);
        i++;
      }
      const docs = rewriteInner(buf.join('\n'));
      if (docs.length === 0) {
        changed = true;
        continue;
      }
      for (const d of docs) out.push(`${indent}// ${d}`);
      changed = true;
      continue;
    }

    // Sentence-case existing // comments (not directives)
    const lineC = line.match(/^(\s*)\/\/(.*)$/);
    if (lineC && !PRESERVE_RE.test(line)) {
      const lead = lineC[2].match(/^\s*/)?.[0] ?? '';
      const body = lineC[2].slice(lead.length);
      if (body.trim()) {
        const sc = sentenceCase(body);
        const next = `${lineC[1]}//${lead}${sc}`;
        if (next !== line) changed = true;
        out.push(next);
        i++;
        continue;
      }
    }

    // Trailing /* note */ on code line (not strings with image/*)
    if (
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('*') &&
      /\/\*[^*][\s\S]*?\*\//.test(line) &&
      !/['"`].*\/\*/.test(line) &&
      !/accept=|image\/\*|video\/\*|audio\/\*|wss:\/\/\*|Allow:/.test(line)
    ) {
      const next = line.replace(/\/\*\*?([^*][\s\S]*?)\*\//g, (_, inner) => {
        if (PRESERVE_RE.test(inner)) return `/*${inner}*/`;
        const docs = rewriteInner(inner);
        const text = docs[0] || sentenceCase(inner);
        changed = true;
        return `// ${text}`;
      });
      // Fix "code // comment" needing space: `foo // bar` from `foo /* bar */`
      out.push(next.replace(/(\S)\/\//g, '$1 //').replace(/\/\/\s\/\//g, '//'));
      i++;
      continue;
    }

    out.push(line);
    i++;
  }

  return { out: out.join('\n'), changed };
}

function processCss(source) {
  let changed = false;
  const out = source.replace(/\/\*([\s\S]*?)\*\//g, (full, inner) => {
    if (PRESERVE_RE.test(full)) return full;
    const docs = rewriteInner(inner, true);
    const text = docs.join(' ') || sentenceCase(inner.replace(/\n/g, ' '));
    if (!text) {
      changed = true;
      return '';
    }
    const next = `/* ${text} */`;
    if (next !== full) changed = true;
    return next;
  });
  return { out, changed };
}

const base = process.cwd();
let touched = 0;
let total = 0;
for (const root of ROOTS) {
  for (const f of walk(path.join(base, root))) {
    total++;
    const original = fs.readFileSync(f, 'utf8');
    const res =
      path.extname(f) === '.css' ? processCss(original) : processTs(original);
    if (res.changed && res.out !== original) {
      fs.writeFileSync(f, res.out);
      touched++;
      console.log('updated', path.relative(base, f));
    }
  }
}
console.log(`Done. Scanned ${total}, updated ${touched}.`);
