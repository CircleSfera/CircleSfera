import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../interfaces/storage-provider.interface.js';
import { MediaReferencesService } from './media-references.service.js';
import {
  DELETED_CONTENT_KEPT_DAYS,
  StoredFilesService,
} from './stored-files.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ERASE_PAGE = 500;

/**
 * Deletes the files of deleted content once they have been kept 30 days
 * (PD-040): each file with an owner detached more than 30 days ago, if no
 * row uses it; one a row uses again is no longer detached.
 */
@Injectable()
export class DetachedFilesErasureService {
  private readonly logger = new Logger(DetachedFilesErasureService.name);

  constructor(
    private readonly storedFiles: StoredFilesService,
    private readonly references: MediaReferencesService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Answers how many files were deleted. Each file's record is taken before
   * its bytes go, so a post attaching it from then on is refused, and the
   * file is looked up again once taken, so a post saved since the page was
   * read keeps it. What remains is a post that checked the file before it
   * was taken and is saved between that second look and the deletion, a
   * moment of a few milliseconds, at night, on a file deleted 30 days ago.
   * A file whose bytes cannot be deleted gets its record back and is tried
   * again the next night. Running on two servers at once is harmless: only
   * one takes each record.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async eraseExpired(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - DELETED_CONTENT_KEPT_DAYS * DAY_MS);
    let erased = 0;
    let after: string | null = null;
    try {
      for (;;) {
        const keys = await this.storedFiles.detachedBefore(
          cutoff,
          after,
          ERASE_PAGE,
        );
        if (keys.length === 0) break;
        after = keys[keys.length - 1];
        const used = await this.references.inUse(keys);
        await this.storedFiles.reattach(keys.filter((key) => used.has(key)));
        for (const key of keys) {
          if (used.has(key)) continue;
          const claimed = await this.storedFiles.claimExpired(key, cutoff);
          if (!claimed) continue;
          try {
            // A row may have been saved since the page was read: keep it.
            if ((await this.references.inUse([key])).has(key)) {
              await this.storedFiles.restoreClaimed(key, claimed);
              await this.storedFiles.reattach([key]);
              continue;
            }
            await this.storage.delete(key);
            erased++;
          } catch (error: unknown) {
            await this.storedFiles.restoreClaimed(key, claimed);
            this.logger.warn(
              `A kept file could not be deleted; it is tried again tomorrow: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    } catch (error: unknown) {
      this.logger.error(
        `Erasing the files of deleted content stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.logger.log(
      `Erased ${erased} files of content deleted more than ${DELETED_CONTENT_KEPT_DAYS} days ago.`,
    );
    return erased;
  }
}
