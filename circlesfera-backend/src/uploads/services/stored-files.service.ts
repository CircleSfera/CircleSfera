import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../interfaces/storage-provider.interface.js';

export const FILE_NOT_OWNED = 'FILE_NOT_OWNED';

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
    @Optional()
    @Inject(STORAGE_PROVIDER)
    private readonly storage?: StorageProvider,
  ) {}

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
      throw new BadRequestException(FILE_NOT_OWNED);
    }
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
