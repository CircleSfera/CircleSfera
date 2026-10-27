import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../interfaces/storage-provider.interface.js';
import { MediaReferencesService } from './media-references.service.js';

export const FILE_NOT_OWNED = ErrorCode.FILE_NOT_OWNED;

// A file inside a video's stream folder, and the extensions a video can have.
const STREAM_FOLDER_FILE =
  /^\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[^/]+$/i;
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v'];

// How long the files of deleted content are kept, readable by their owner
// only, before the nightly erasure deletes them (PD-040).
export const DELETED_CONTENT_KEPT_DAYS = 30;

/** Who a stored file is recorded for. */
export interface StoredFileOwner {
  // The Profile the file belongs to; null when it is not known.
  profileId: string | null;
  // The person who uploaded it, for the record only: a team member uploads
  // for a Business Profile that is not theirs.
  uploadedById?: string | null;
}

// The record of who owns each file this server stores. It is written only
// from what the storage answered (an upload, or a file the server made from
// another), never from an address a person sends.
@Injectable()
export class StoredFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: MediaReferencesService,
    @Optional()
    @Inject(STORAGE_PROVIDER)
    private readonly storage?: StorageProvider,
  ) {}

  /**
   * Settles the files of a deleted piece of content, once its row is gone.
   * Every recorded file that no row uses any more is marked detached: from
   * then on only its owner may read it, until it is deleted. Answers the
   * ones that may be deleted with the content: recorded as the author's own.
   * A file of another Profile, or with no owner, is never deleted by a
   * person's action; it is left, detached, to the orphan sweep.
   */
  async release(
    profileId: string,
    keys: Array<string | null | undefined>,
  ): Promise<string[]> {
    const wanted = [
      ...new Set(keys.filter((k): k is string => !!k && k.length > 0)),
    ];
    if (wanted.length === 0) return [];
    const recorded = await this.prisma.storedFile.findMany({
      where: { key: { in: wanted } },
      select: { key: true, profileId: true },
    });
    const used = await this.references.inUse(recorded.map((file) => file.key));
    const unused = recorded.filter((file) => !used.has(file.key));
    if (unused.length > 0) {
      await this.prisma.storedFile.updateMany({
        where: {
          key: { in: unused.map((file) => file.key) },
          detachedAt: null,
        },
        data: { detachedAt: new Date() },
      });
    }
    return unused
      .filter((file) => file.profileId === profileId)
      .map((file) => file.key);
  }

  /**
   * Whether a viewer may read stored files, by their exact keys: a detached
   * one is its owner's only, until a row uses it again. A row is the only
   * proof of a new attach: it exists once the content holding it is saved,
   * and never if that save failed. A key that is not recorded is not this
   * check's.
   */
  async areReadableBy(
    keys: string[],
    viewerProfileId: string | null,
  ): Promise<boolean> {
    if (keys.length === 0) return true;
    const detached = await this.prisma.storedFile.findMany({
      where: { key: { in: keys }, detachedAt: { not: null } },
      select: { key: true, profileId: true },
    });
    const closed = detached
      .filter((file) => !viewerProfileId || file.profileId !== viewerProfileId)
      .map((file) => file.key);
    if (closed.length === 0) return true;
    // A file of a video's stream folder is used by a row naming the folder.
    const used = await this.references.inUse(closed);
    if (!closed.every((key) => used.has(key))) return false;
    await this.reattach(closed);
    return true;
  }

  /**
   * Refuses a file of this server's storage that does not belong to one of
   * the given Profiles: a person may attach only their Profile's own files.
   * Addresses of other storages are not this server's to check. A storage
   * that cannot tell its own addresses has every address checked.
   */
  async assertOwnedBy(
    profileIds: string | string[],
    addresses: Array<string | null | undefined>,
  ): Promise<void> {
    const owners = Array.isArray(profileIds) ? profileIds : [profileIds];
    const stored = [
      ...new Set(
        addresses.filter(
          (address): address is string =>
            typeof address === 'string' &&
            address.length > 0 &&
            (this.storage?.ownsUrl?.(address) ?? true),
        ),
      ),
    ];
    // A file of a video's stream folder (/uploads/<uuid>/...) is the
    // video's: it is attachable only if the video is the sender's own.
    const folders = [
      ...new Set(
        addresses.flatMap((address) => {
          const match =
            typeof address === 'string'
              ? STREAM_FOLDER_FILE.exec(address)
              : null;
          return match ? [match[1]] : [];
        }),
      ),
    ];
    for (const folder of folders) {
      const video = await this.prisma.storedFile.count({
        where: {
          key: {
            in: VIDEO_EXTENSIONS.map((ext) => `/uploads/${folder}.${ext}`),
          },
          profileId: { in: owners },
        },
      });
      if (video === 0) {
        throw AppException.BadRequest(
          ErrorCode.FILE_NOT_OWNED,
          'A stored file that this Profile did not upload cannot be attached',
        );
      }
    }
    if (stored.length === 0) return;
    const owned = await this.prisma.storedFile.count({
      where: { key: { in: stored }, profileId: { in: owners } },
    });
    if (owned < stored.length) {
      throw AppException.BadRequest(
        ErrorCode.FILE_NOT_OWNED,
        'A stored file that this Profile did not upload cannot be attached',
      );
    }
    // A detached file stays detached here: the content may still fail to
    // save. Once a row uses it, the media check opens it again.
  }

  /**
   * Files with an owner detached before the given time, a page at a time in
   * the order of their keys, from after the key given. A file with no owner
   * is the orphan sweep's, not the erasure's.
   */
  async detachedBefore(
    cutoff: Date,
    afterKey: string | null,
    take: number,
  ): Promise<string[]> {
    const rows = await this.prisma.storedFile.findMany({
      where: {
        detachedAt: { lt: cutoff },
        profileId: { not: null },
        ...(afterKey ? { key: { gt: afterKey } } : {}),
      },
      orderBy: { key: 'asc' },
      take,
      select: { key: true },
    });
    return rows.map((row) => row.key);
  }

  /**
   * Takes the record of a file whose 30 days are over, so that it can be
   * deleted: answers it only if the file is still detached since before the
   * cutoff and has an owner. Once taken, the file can no longer be attached
   * again (FILE_NOT_OWNED), so a deletion cannot race a new attach.
   */
  async claimExpired(
    key: string,
    cutoff: Date,
  ): Promise<{ profileId: string; detachedAt: Date } | null> {
    const row = await this.prisma.storedFile.findUnique({
      where: { key },
      select: { profileId: true, detachedAt: true },
    });
    if (!row?.profileId || !row.detachedAt || row.detachedAt >= cutoff) {
      return null;
    }
    const taken = await this.prisma.storedFile.deleteMany({
      where: { key, detachedAt: { lt: cutoff }, profileId: row.profileId },
    });
    return taken.count > 0
      ? { profileId: row.profileId, detachedAt: row.detachedAt }
      : null;
  }

  /** Puts back the record of a file that could not be deleted after all. */
  async restoreClaimed(
    key: string,
    claimed: { profileId: string; detachedAt: Date },
  ): Promise<void> {
    await this.prisma.storedFile.createMany({
      data: [{ key, ...claimed }],
      skipDuplicates: true,
    });
  }

  /** Files detached at or after the given time: still within their days. */
  async detachedSince(cutoff: Date): Promise<Set<string>> {
    const rows = await this.prisma.storedFile.findMany({
      where: { detachedAt: { gte: cutoff } },
      select: { key: true },
    });
    return new Set(rows.map((row) => row.key));
  }

  /** Files a row uses again: no longer detached. */
  async reattach(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.prisma.storedFile.updateMany({
      where: { key: { in: keys }, detachedAt: { not: null } },
      data: { detachedAt: null },
    });
  }

  /** The recorded owner of each of the files that has one. */
  async ownersOf(keys: string[]): Promise<Map<string, string>> {
    if (keys.length === 0) return new Map();
    const rows = await this.prisma.storedFile.findMany({
      where: { key: { in: keys }, profileId: { not: null } },
      select: { key: true, profileId: true },
    });
    return new Map(
      rows.flatMap((row) => (row.profileId ? [[row.key, row.profileId]] : [])),
    );
  }

  /** Forgets the files the storage has just deleted. */
  async forget(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.prisma.storedFile.deleteMany({ where: { key: { in: keys } } });
  }

  /**
   * Records files the storage just stored. A file already recorded keeps its
   * first owner.
   */
  async record(
    keys: string[],
    owner: StoredFileOwner,
    client: Pick<Prisma.TransactionClient, 'storedFile'> = this.prisma,
  ): Promise<void> {
    const data = [...new Set(keys.filter((key) => key.length > 0))].map(
      (key) => ({
        key,
        profileId: owner.profileId,
        uploadedById: owner.uploadedById ?? null,
      }),
    );
    if (data.length === 0) return;
    await client.storedFile.createMany({ data, skipDuplicates: true });
  }
}
