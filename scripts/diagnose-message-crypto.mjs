/**
 * Classify Message.content crypto status on a running backend container.
 * Copied into the container at ops time — does not require a new image.
 *
 * Usage inside backend container:
 *   node diagnose-message-crypto.mjs
 */
import crypto from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;
const SALT = 'salt';
const LEGACY_DEFAULT = 'default-secret-key-32-chars-long!';

function deriveKey(secret) {
  return crypto.scryptSync(secret, SALT, 32);
}

function fingerprint(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 12);
}

function analyzeShape(encryptedText) {
  const parts = encryptedText.split(':');
  return {
    parts: parts.length,
    lengths: parts.map((p) => p.length),
    hexOk: parts.slice(0, 3).map((p) => /^[0-9a-f]+$/i.test(p)),
  };
}

function decryptWithKey(encryptedText, key) {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error(`format parts=${parts.length}`);
  const [ivHex, authTagHex, encryptedHex] = parts;
  if (ivHex.length !== 32 || authTagHex.length !== 32) {
    throw new Error(`format iv=${ivHex.length} tag=${authTagHex.length}`);
  }
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const legacySecret = process.env.ENCRYPTION_KEY_LEGACY || LEGACY_DEFAULT;
const newSecret = process.env.ENCRYPTION_KEY;
const databaseUrl = process.env.DATABASE_URL;
const extraCandidates = (process.env.ENCRYPTION_KEY_CANDIDATES || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length >= 32);

if (!newSecret || newSecret.length < 32) {
  throw new Error('ENCRYPTION_KEY missing or too short');
}
if (!databaseUrl) {
  throw new Error('DATABASE_URL missing');
}

const namedKeys = [
  { name: 'ENCRYPTION_KEY', secret: newSecret },
  { name: 'ENCRYPTION_KEY_LEGACY', secret: legacySecret },
  { name: 'LEGACY_DEFAULT', secret: LEGACY_DEFAULT },
  ...extraCandidates.map((secret, i) => ({
    name: `CANDIDATE_${i + 1}`,
    secret,
  })),
];

// Dedupe by fingerprint
const seen = new Set();
const keys = [];
for (const k of namedKeys) {
  const fp = fingerprint(k.secret);
  if (seen.has(fp)) continue;
  seen.add(fp);
  keys.push({ ...k, fp, key: deriveKey(k.secret) });
}

console.log(
  'keys:',
  keys.map((k) => ({ name: k.name, len: k.secret.length, fp: k.fp })),
);

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const counts = {
  scanned: 0,
  needs_reencrypt: 0,
  already_current: 0,
  not_ciphertext: 0,
  foreign_ciphertext: 0,
  decrypt_miss: 0,
  matched_other: {},
};

try {
  const messages = await prisma.message.findMany({
    select: { id: true, content: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const msg of messages) {
    counts.scanned++;
    if (!msg.content?.includes(':')) {
      counts.not_ciphertext++;
      console.log(
        JSON.stringify({
          id: msg.id,
          createdAt: msg.createdAt,
          status: 'not_ciphertext',
          preview: String(msg.content).slice(0, 24),
        }),
      );
      continue;
    }

    const shape = analyzeShape(msg.content);
    const looksLikeOurs =
      shape.parts === 3 &&
      shape.lengths[0] === 32 &&
      shape.lengths[1] === 32 &&
      shape.hexOk[0] &&
      shape.hexOk[1] &&
      shape.hexOk[2];

    if (!looksLikeOurs) {
      counts.foreign_ciphertext = (counts.foreign_ciphertext || 0) + 1;
      console.log(
        JSON.stringify({
          id: msg.id,
          createdAt: msg.createdAt,
          status: 'foreign_ciphertext',
          shape,
        }),
      );
      continue;
    }

    let matched = null;
    for (const k of keys) {
      try {
        decryptWithKey(msg.content, k.key);
        matched = k.name;
        break;
      } catch {
        // try next
      }
    }

    if (matched === 'ENCRYPTION_KEY_LEGACY' || matched === 'LEGACY_DEFAULT') {
      counts.needs_reencrypt++;
    } else if (matched === 'ENCRYPTION_KEY') {
      counts.already_current++;
    } else if (matched) {
      counts.matched_other[matched] = (counts.matched_other[matched] || 0) + 1;
    } else {
      counts.decrypt_miss++;
    }

    console.log(
      JSON.stringify({
        id: msg.id,
        createdAt: msg.createdAt,
        status: matched || 'decrypt_miss',
        shape,
      }),
    );
  }

  console.log('summary:', JSON.stringify(counts, null, 2));
  if (counts.decrypt_miss > 0) {
    console.error(
      `WARNING: ${counts.decrypt_miss} AES-GCM message(s) matched no known key.`,
    );
    process.exitCode = 2;
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
