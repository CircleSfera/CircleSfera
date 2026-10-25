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

  /** The recorded video whose stream folder this is, if any. */
  async keyOfFolder(folder: string): Promise<string | null> {
    const file = await this.prisma.storedFile.findFirst({
      where: { key: { startsWith: `${folder}.` } },
      select: { key: true },
    });
    return file?.key ?? null;
  }

  /** Whether a viewer may read a stored file: a detached one is its owner's. */
  async isReadableBy(
    key: string,
    viewerProfileId: string | null,
  ): Promise<boolean> {
    const file = await this.prisma.storedFile.findUnique({
      where: { key },
      select: { profileId: true, detachedAt: true },
    });
    if (!file?.detachedAt) return true;
    return !!viewerProfileId && file.profileId === viewerProfileId;
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
    // Attached again: no longer detached.
    await this.prisma.storedFile.updateMany({
      where: { key: { in: stored }, detachedAt: { not: null } },
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
