#!/usr/bin/env node
/**
 * Makes the photos and the video the browser tests post: illustrated scenes
 * in the brand's colours, with no text, so a capture looks like a real post.
 *
 *   node e2e/fixtures/make-fixtures.mjs
 *
 * Needs ffmpeg on the PATH for the video.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const HERE = import.meta.dirname;

/** A post photo: 4:5, the shape a post has by default. */
const PHOTO = { width: 1080, height: 1350 };
/** A Frame: 9:16, 20 seconds, as long as a Frame needs to be. */
const FRAME = { width: 720, height: 1280, seconds: 20, fps: 30 };

/** A seeded random, so the scenes come out the same every time. */
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function stars(count, { width }, seed, maxY) {
  const random = seeded(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const r = 0.8 + random() * 2.2;
    out += `<circle cx="${(random() * width).toFixed(1)}" cy="${(random() * maxY).toFixed(1)}" r="${r.toFixed(1)}" fill="#fff" opacity="${(0.35 + random() * 0.6).toFixed(2)}"/>`;
  }
  return out;
}

/** The sun setting over the sea, with mountains and its light on the water. */
function sunsetSea({ width: w, height: h }) {
  const horizon = h * 0.6;
  let glints = '';
  const random = seeded(7);
  for (let i = 0; i < 26; i++) {
    const y = horizon + 18 + i * 17;
    const half = (90 - i * 2.2) * (0.7 + random() * 0.6);
    glints += `<rect x="${(w / 2 - half).toFixed(0)}" y="${y}" width="${(half * 2).toFixed(0)}" height="5" rx="2.5" fill="#ffd6a5" opacity="${(0.75 - i * 0.025).toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a1458"/>
      <stop offset="0.38" stop-color="#7b2f8f"/>
      <stop offset="0.72" stop-color="#f0607a"/>
      <stop offset="1" stop-color="#ffb070"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a2a7a"/>
      <stop offset="1" stop-color="#160b35"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff3d6" stop-opacity="0.95"/>
      <stop offset="0.35" stop-color="#ffc58a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ff7a7a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${horizon}" fill="url(#sky)"/>
  ${stars(40, { width: w, height: h }, 3, horizon * 0.35)}
  <circle cx="${w / 2}" cy="${horizon - 230}" r="440" fill="url(#glow)"/>
  <circle cx="${w / 2}" cy="${horizon - 230}" r="140" fill="#ffe2b8"/>
  <path d="M0 ${horizon - 120} L170 ${horizon - 260} L310 ${horizon - 150} L430 ${horizon - 230} L560 ${horizon - 90} L0 ${horizon - 40} Z" fill="#3b1a63" opacity="0.9"/>
  <path d="M${w} ${horizon - 140} L${w - 160} ${horizon - 300} L${w - 300} ${horizon - 170} L${w - 420} ${horizon - 240} L${w - 560} ${horizon - 70} L${w} ${horizon - 40} Z" fill="#331556" opacity="0.95"/>
  <rect y="${horizon - 60}" width="${w}" height="60" fill="#2a1250"/>
  <rect y="${horizon}" width="${w}" height="${h - horizon}" fill="url(#sea)"/>
  ${glints}
  <path d="M0 ${h} L0 ${h - 170} Q 220 ${h - 260} 470 ${h - 190} T ${w} ${h - 120} L ${w} ${h} Z" fill="#0d0624"/>
  <g fill="#0d0624">
    <circle cx="330" cy="${h - 268}" r="13"/><rect x="319" y="${h - 256}" width="22" height="58" rx="10"/>
    <circle cx="368" cy="${h - 262}" r="12"/><rect x="358" y="${h - 251}" width="20" height="52" rx="9"/>
  </g>
  <path d="M250 260 q 20 -18 40 0 q 20 -18 40 0" stroke="#2a1250" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M760 200 q 15 -13 30 0 q 15 -13 30 0" stroke="#2a1250" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;
}

/** A city at night under the moon, its windows lit. */
function cityNight({ width: w, height: h }) {
  const random = seeded(11);
  let buildings = '';
  const ground = h * 0.86;
  let x = -20;
  while (x < w) {
    const bw = 110 + random() * 120;
    const bh = 380 + random() * 520;
    const shade = ['#24124d', '#2c1660', '#1d0f40'][Math.floor(random() * 3)];
    buildings += `<rect x="${x.toFixed(0)}" y="${(ground - bh).toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" fill="${shade}"/>`;
    for (let wy = ground - bh + 34; wy < ground - 40; wy += 46) {
      for (let wx = x + 20; wx < x + bw - 30; wx += 36) {
        if (random() < 0.42) {
          buildings += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="16" height="22" rx="2" fill="${random() < 0.7 ? '#ffd27a' : '#9fd8ff'}" opacity="${(0.6 + random() * 0.4).toFixed(2)}"/>`;
        }
      }
    }
    x += bw + 8 + random() * 20;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0726"/>
      <stop offset="0.55" stop-color="#3a1a78"/>
      <stop offset="1" stop-color="#c2408f"/>
    </linearGradient>
    <radialGradient id="moonGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  ${stars(90, { width: w, height: h }, 5, h * 0.5)}
  <circle cx="${w * 0.74}" cy="${h * 0.17}" r="200" fill="url(#moonGlow)"/>
  <circle cx="${w * 0.74}" cy="${h * 0.17}" r="86" fill="#fdf3dc"/>
  <circle cx="${w * 0.74 + 34}" cy="${h * 0.17 - 22}" r="78" fill="#2b1663" opacity="0.18"/>
  ${buildings}
  <rect y="${ground}" width="${w}" height="${h - ground}" fill="#120a2c"/>
  <rect y="${ground + 30}" width="${w}" height="6" fill="#ff8ac8" opacity="0.35"/>
</svg>`;
}

/** A cup of coffee on a table in the morning light, steaming. */
function coffee({ width: w, height: h }) {
  const table = h * 0.62;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd3a8"/>
      <stop offset="1" stop-color="#f08a8a"/>
    </linearGradient>
    <linearGradient id="tableTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7a3d6e"/>
      <stop offset="1" stop-color="#3e1b4d"/>
    </linearGradient>
    <linearGradient id="cup" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e9ddf2"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#wall)"/>
  <rect x="${w * 0.08}" y="${h * 0.08}" width="${w * 0.36}" height="${h * 0.34}" rx="18" fill="#fff4e6" opacity="0.55"/>
  <rect x="${w * 0.255}" y="${h * 0.08}" width="8" height="${h * 0.34}" fill="#f2b394" opacity="0.6"/>
  <rect x="${w * 0.08}" y="${h * 0.245}" width="${w * 0.36}" height="8" fill="#f2b394" opacity="0.6"/>
  <g transform="translate(${w * 0.8} ${table - 250})">
    <path d="M-60 250 L-46 120 L46 120 L60 250 Z" fill="#8a4fb8"/>
    <path d="M0 120 C -90 40 -70 -60 -10 -90 C -30 -10 -10 60 0 120 Z" fill="#3f9b6f"/>
    <path d="M0 120 C 80 50 90 -40 40 -80 C 40 0 20 70 0 120 Z" fill="#53b685"/>
    <path d="M0 120 C -20 30 10 -70 0 -130 C 30 -60 30 40 0 120 Z" fill="#2f7f5a"/>
  </g>
  <rect y="${table}" width="${w}" height="${h - table}" fill="url(#tableTop)"/>
  <ellipse cx="${w / 2}" cy="${table + 210}" rx="300" ry="62" fill="#2a1038" opacity="0.45"/>
  <ellipse cx="${w / 2}" cy="${table + 190}" rx="290" ry="66" fill="#f6eefb"/>
  <ellipse cx="${w / 2}" cy="${table + 182}" rx="200" ry="40" fill="#e3d4ee"/>
  <path d="M${w / 2 + 170} ${table - 10} c 120 -10 130 140 10 150" stroke="#f6eefb" stroke-width="34" fill="none"/>
  <path d="M${w / 2 - 190} ${table - 60} L${w / 2 + 190} ${table - 60} L${w / 2 + 160} ${table + 170} Q ${w / 2} ${table + 210} ${w / 2 - 160} ${table + 170} Z" fill="url(#cup)"/>
  <ellipse cx="${w / 2}" cy="${table - 60}" rx="190" ry="44" fill="#f6eefb"/>
  <ellipse cx="${w / 2}" cy="${table - 56}" rx="168" ry="34" fill="#5b2f1e"/>
  <path d="M${w / 2 - 60} ${table - 58} q 60 -26 120 0 q -60 22 -120 0 Z" fill="#c98a5a" opacity="0.8"/>
  <g stroke="#ffffff" stroke-width="14" stroke-linecap="round" fill="none" opacity="0.6">
    <path d="M${w / 2 - 70} ${table - 130} c -40 -60 40 -100 0 -170"/>
    <path d="M${w / 2 + 10} ${table - 140} c -40 -60 40 -110 0 -190"/>
    <path d="M${w / 2 + 90} ${table - 130} c -40 -60 40 -100 0 -160"/>
  </g>
</svg>`;
}

/**
 * The northern lights over snowy mountains, drawn taller than a Frame so the
 * camera can pan down it.
 */
function aurora({ width: w, height: h }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#060318"/>
      <stop offset="0.6" stop-color="#1a1050"/>
      <stop offset="1" stop-color="#3a1f7a"/>
    </linearGradient>
    <linearGradient id="band" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3cf0b4" stop-opacity="0"/>
      <stop offset="0.3" stop-color="#3cf0b4" stop-opacity="0.75"/>
      <stop offset="0.65" stop-color="#8a7bff" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#ff6ad5" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="38"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  ${stars(160, { width: w, height: h }, 9, h * 0.75)}
  <g filter="url(#soft)">
    <path d="M-80 ${h * 0.34} C ${w * 0.25} ${h * 0.2}, ${w * 0.5} ${h * 0.42}, ${w + 80} ${h * 0.22} L ${w + 80} ${h * 0.3} C ${w * 0.5} ${h * 0.5}, ${w * 0.25} ${h * 0.3}, -80 ${h * 0.44} Z" fill="url(#band)"/>
    <path d="M-80 ${h * 0.5} C ${w * 0.3} ${h * 0.4}, ${w * 0.6} ${h * 0.58}, ${w + 80} ${h * 0.42} L ${w + 80} ${h * 0.47} C ${w * 0.6} ${h * 0.63}, ${w * 0.3} ${h * 0.46}, -80 ${h * 0.56} Z" fill="url(#band)" opacity="0.7"/>
  </g>
  <path d="M0 ${h * 0.8} L${w * 0.22} ${h * 0.66} L${w * 0.36} ${h * 0.74} L${w * 0.55} ${h * 0.6} L${w * 0.78} ${h * 0.75} L${w} ${h * 0.68} L${w} ${h} L0 ${h} Z" fill="#2a1f5e"/>
  <path d="M${w * 0.47} ${h * 0.645} L${w * 0.55} ${h * 0.6} L${w * 0.62} ${h * 0.642} L${w * 0.58} ${h * 0.652} L${w * 0.55} ${h * 0.638} L${w * 0.51} ${h * 0.655} Z" fill="#e8e4ff"/>
  <path d="M${w * 0.15} ${h * 0.705} L${w * 0.22} ${h * 0.66} L${w * 0.28} ${h * 0.695} L${w * 0.24} ${h * 0.7} L${w * 0.2} ${h * 0.69} Z" fill="#e8e4ff"/>
  <path d="M0 ${h * 0.88} L${w * 0.3} ${h * 0.8} L${w * 0.6} ${h * 0.86} L${w} ${h * 0.79} L${w} ${h} L0 ${h} Z" fill="#160f3c"/>
  <g fill="#0b0726">
    ${Array.from({ length: 9 }, (_, i) => {
      const x = (i + 0.5) * (w / 9);
      const base = h * 0.95;
      return `<path d="M${x} ${base - 150} L${x + 42} ${base} L${x - 42} ${base} Z"/>`;
    }).join('')}
  </g>
  <rect y="${h * 0.95}" width="${w}" height="${h * 0.05}" fill="#0b0726"/>
</svg>`;
}

async function photo(name, draw) {
  const file = path.join(HERE, name);
  await sharp(Buffer.from(draw(PHOTO)))
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(file);
  return file;
}

async function frameVideo() {
  const work = mkdtempSync(path.join(tmpdir(), 'circlesfera-fixtures-'));
  try {
    // Taller than the Frame: the camera pans from the sky down to the hills.
    const scene = path.join(work, 'aurora.png');
    const tall = { width: FRAME.width, height: Math.round(FRAME.height * 1.5) };
    await sharp(Buffer.from(aurora(tall)))
      .png()
      .toFile(scene);
    const travel = tall.height - FRAME.height;
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-loop',
      '1',
      '-framerate',
      String(FRAME.fps),
      '-i',
      scene,
      '-t',
      String(FRAME.seconds),
      '-vf',
      `crop=${FRAME.width}:${FRAME.height}:0:'${travel}*t/${FRAME.seconds}',format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '30',
      '-movflags',
      '+faststart',
      path.join(HERE, 'frame-20s.mp4'),
    ]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await photo('post-4x5.jpg', sunsetSea);
await photo('post-4x5-city.jpg', cityNight);
await photo('post-4x5-coffee.jpg', coffee);
await frameVideo();
console.log('Fixtures written to', HERE);
