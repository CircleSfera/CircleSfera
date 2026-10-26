/**
 * Read-only report of the files the nightly orphan sweep would delete, for
 * the owner to read before deletion is turned on (TD-008, QF-065).
 *
 * It lists the stored files on the server's disk and compares them with
 * every row that names a file (MEDIA_COLUMNS and the clips of edit projects)
 * and with the record of who owns each file. It writes nothing.
 *
 * Actions logs are public: it prints only counts and sizes, never a file
 * name or an address.
 *
 * Usage (production container, after the build — see ops-orphan-files-report.yml):
 *
 *   docker compose -f docker-compose.prod.yml exec backend \
 *     node dist/scripts/orphan-files-report.js
 */
import 'dotenv/config';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MediaReferencesService } from '../uploads/services/media-references.service.js';
import { listStoredFilesOnDisk } from './stored-files-on-disk.js';

// The sweep keeps a file this recent: it may be an upload in progress.
const GRACE_HOURS = 24;

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  // Nothing it uses should log, but a log may name where files are kept: not
  // for a public log.
  Logger.overrideLogger(false);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const references = new MediaReferencesService(
      prisma as unknown as PrismaService,
    );
    const [files, referenced, records] = await Promise.all([
      // Read only, and strict: the storage would create a missing folder and
      // write a test file in it, and answers no file when it cannot read it.
      listStoredFilesOnDisk(path.join(process.cwd(), 'uploads')),
      references.referencedKeys(),
      prisma.storedFile.findMany({ select: { key: true, profileId: true } }),
    ]);

    const cutoff = Date.now() - GRACE_HOURS * 60 * 60 * 1000;
    const onDisk = new Set(files.map((file) => file.url));
    let used = 0;
    let unusedOld = 0;
    let unusedOldBytes = 0;
    let unusedRecent = 0;
    let totalBytes = 0;
    for (const file of files) {
      totalBytes += file.sizeBytes;
      if (referenced.has(file.url) || referenced.has(path.basename(file.url))) {
        used++;
      } else if (file.lastModified.getTime() > cutoff) {
        unusedRecent++;
      } else {
        unusedOld++;
        unusedOldBytes += file.sizeBytes;
      }
    }
    const owned = records.filter((record) => record.profileId).length;
    const recordedKeys = new Set(records.map((record) => record.key));
    const unrecorded = files.filter((file) => !recordedKeys.has(file.url));
    const gone = records.filter((record) => !onDisk.has(record.key)).length;

    console.log(
      `Stored files on the disk: ${files.length} (${megabytes(totalBytes)})`,
    );
    console.log(`  used by a row: ${used}`);
    console.log(
      `  used by no row, older than ${GRACE_HOURS} h (the sweep would delete these): ${unusedOld} (${megabytes(unusedOldBytes)})`,
    );
    console.log(`  used by no row, more recent: ${unusedRecent}`);
    console.log(`Record of owners: ${records.length} rows`);
    console.log(`  with an owner: ${owned}`);
    console.log(`  with no owner: ${records.length - owned}`);
    console.log(`  of a file no longer on the disk: ${gone}`);
    console.log(
      `Files on the disk the record does not know: ${unrecorded.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Only the kind of error: its message can name the database's address.
  console.error(
    `Orphan files report failed: ${error instanceof Error ? error.name : 'error'}`,
  );
  process.exit(1);
});
