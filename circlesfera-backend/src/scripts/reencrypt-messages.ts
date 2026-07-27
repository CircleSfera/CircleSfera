/**
 * Re-encrypt Message.content from a legacy ENCRYPTION_KEY to a new one.
 *
 * Usage (local, from circlesfera-backend/):
 *   ENCRYPTION_KEY_LEGACY='default-secret-key-32-chars-long!' \
 *   ENCRYPTION_KEY='your-new-32+-char-secret................' \
 *   DATABASE_URL='postgresql://...' \
 *   npx tsx src/scripts/reencrypt-messages.ts [--dry-run]
 *
 * Usage (production container, after nest build):
 *   docker compose -f docker-compose.prod.yml exec backend \
 *     node dist/scripts/reencrypt-messages.js [--dry-run]
 *
 * If ENCRYPTION_KEY_LEGACY is omitted, the historical insecure default is used.
 * ALWAYS take a DB backup before running without --dry-run.
 */
import { PrismaClient } from '@prisma/client';
import {
  CryptoService,
  LEGACY_DEFAULT_ENCRYPTION_KEY,
} from '../common/services/crypto.service.js';

const dryRun = process.argv.includes('--dry-run');
const batchSize = 200;

async function main() {
  const legacySecret =
    process.env.ENCRYPTION_KEY_LEGACY || LEGACY_DEFAULT_ENCRYPTION_KEY;
  const newSecret = process.env.ENCRYPTION_KEY;

  if (!newSecret || newSecret.length < 32) {
    throw new Error('ENCRYPTION_KEY (new) must be set and at least 32 chars');
  }
  if (legacySecret === newSecret) {
    throw new Error('ENCRYPTION_KEY_LEGACY and ENCRYPTION_KEY must differ');
  }

  const oldKey = CryptoService.deriveKey(legacySecret);
  const newKey = CryptoService.deriveKey(newSecret);
  const prisma = new PrismaClient();

  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    dryRun
      ? '[dry-run] Scanning messages…'
      : 'Re-encrypting messages… (backup first!)',
  );

  for (;;) {
    const messages = await prisma.message.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, content: true },
    });

    if (messages.length === 0) break;

    for (const msg of messages) {
      scanned++;
      cursor = msg.id;
      if (!msg.content?.includes(':')) {
        skipped++;
        continue;
      }

      try {
        const plaintext = CryptoService.decryptWithKey(msg.content, oldKey);
        const reencrypted = CryptoService.encryptWithKey(plaintext, newKey);
        if (!dryRun) {
          await prisma.message.update({
            where: { id: msg.id },
            data: { content: reencrypted },
          });
        }
        updated++;
      } catch {
        // Already on new key, or plaintext / corrupt — leave alone.
        skipped++;
        failed++;
      }
    }

    console.log(
      `… scanned=${scanned} updated=${updated} skipped=${skipped} decrypt_miss=${failed}`,
    );
  }

  await prisma.$disconnect();
  console.log(
    `Done. scanned=${scanned} updated=${updated} skipped=${skipped} decrypt_miss=${failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
