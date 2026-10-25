import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

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
  constructor(private readonly prisma: PrismaService) {}

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
