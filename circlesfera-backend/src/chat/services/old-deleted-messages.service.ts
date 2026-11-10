import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DELETION_TRANSACTION } from '../../uploads/services/stored-files.service.js';
import { UploadsService } from '../../uploads/uploads.service.js';

const PAGE = 100;
// At most this many messages a night, so one run never takes long.
const PAGES_PER_RUN = 20;

// A deleted message that still names a file: one deleted before a deleted
// message stopped naming its files.
const STILL_NAMES_A_FILE: Prisma.MessageWhereInput = {
  isDeleted: true,
  OR: [
    { url: { not: null } },
    { standardUrl: { not: null } },
    { thumbnailUrl: { not: null } },
    { voiceUrl: { not: null } },
    { mediaId: { not: null } },
    { voiceMediaId: { not: null } },
  ],
};

/**
 * Settles the files of messages deleted before a deleted message stopped
 * naming its files: each is settled as a message deleted today is, its
 * addresses cleared and its files set aside (readable by their owner only,
 * then erased by the nightly sweep) when no other row uses them. Once every
 * old message is settled, a run finds nothing to do.
 */
@Injectable()
export class OldDeletedMessagesService {
  private readonly logger = new Logger(OldDeletedMessagesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UploadsService) private readonly uploadsService: UploadsService,
  ) {}

  @Cron('30 2 * * *')
  async settle(): Promise<number> {
    let settled = 0;
    // A message that fails is left for the next night, and not read again
    // tonight, so it never holds back the others.
    const failed: string[] = [];
    for (let page = 0; page < PAGES_PER_RUN; page++) {
      const messages = await this.prisma.message.findMany({
        where: failed.length
          ? { ...STILL_NAMES_A_FILE, id: { notIn: failed } }
          : STILL_NAMES_A_FILE,
        take: PAGE,
        select: {
          id: true,
          url: true,
          standardUrl: true,
          thumbnailUrl: true,
          voiceUrl: true,
          media: {
            select: { url: true, standardUrl: true, thumbnailUrl: true },
          },
          voiceMedia: { select: { url: true } },
        },
      });
      if (messages.length === 0) break;
      for (const message of messages) {
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.message.update({
              where: { id: message.id },
              data: {
                url: null,
                standardUrl: null,
                thumbnailUrl: null,
                mediaType: null,
                mediaId: null,
                voiceUrl: null,
                voiceDuration: null,
                voiceWaveform: Prisma.DbNull,
                voiceMediaId: null,
                gif: Prisma.DbNull,
              },
            });
            await this.uploadsService.releaseContentFiles(
              [
                message.url,
                message.standardUrl,
                message.thumbnailUrl,
                message.voiceUrl,
                message.media?.url,
                message.media?.standardUrl,
                message.media?.thumbnailUrl,
                message.voiceMedia?.url,
              ],
              tx,
            );
          }, DELETION_TRANSACTION);
          settled++;
        } catch (error: unknown) {
          // The message keeps its addresses and is tried again next night.
          failed.push(message.id);
          this.logger.error(
            `Could not settle the files of deleted message ${message.id}`,
            error,
          );
        }
      }
      if (messages.length < PAGE) break;
    }
    if (settled > 0) {
      this.logger.log(`Settled the files of ${settled} old deleted messages`);
    }
    return settled;
  }
}
