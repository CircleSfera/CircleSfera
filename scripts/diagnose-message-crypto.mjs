/**
 * Classify Message.content crypto status on a running backend container.
 * Copied into the container at ops time — does not require a new image.
 *
 * Usage inside backend container:
 *   node /tmp/diagnose-message-crypto.mjs
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

function decryptWithKey(encryptedText, key) {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('format');
  const [ivHex, authTagHex, encryptedHex] = parts;
  if (ivHex.length !== 32 || authTagHex.length !== 32) throw new Error('format');
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

if (!newSecret || newSecret.length < 32) {
  throw new Error('ENCRYPTION_KEY missing or too short');
}
if (!databaseUrl) {
  throw new Error('DATABASE_URL missing');
}

const oldKey = deriveKey(legacySecret);
const newKey = deriveKey(newSecret);
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const counts = {
  scanned: 0,
  needs_reencrypt: 0,
  already_current: 0,
  not_ciphertext: 0,
  decrypt_miss: 0,
};

try {
  const messages = await prisma.message.findMany({
    select: { id: true, content: true },
    orderBy: { id: 'asc' },
  });

  for (const msg of messages) {
    counts.scanned++;
    if (!msg.content?.includes(':')) {
      counts.not_ciphertext++;
      continue;
    }
    try {
      decryptWithKey(msg.content, oldKey);
      counts.needs_reencrypt++;
      continue;
    } catch {
      // try current
    }
    try {
      decryptWithKey(msg.content, newKey);
      counts.already_current++;
    } catch {
      counts.decrypt_miss++;
    }
  }

  console.log(JSON.stringify(counts, null, 2));
  if (counts.decrypt_miss > 0) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
  await pool.end();
}
