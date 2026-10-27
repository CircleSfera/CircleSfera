import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StoredFilesService } from '../../uploads/services/stored-files.service.js';

const ENDED_PAGE = 100;

// Erasing one conversation reads its messages and deletes it with them; a
// long one may take a while, and it must not wait long for its row.
const ERASE_TRANSACTION = { timeout: 30_000, maxWait: 5_000 };

/**
 * A conversation nobody is in any more: none of its rows is one its Profile
 * still has. A member who leaves a group or is removed from it loses their
 * row; a Profile that deletes a one-to-one chat, or declines an invitation,
 * keeps a row marked removed (deletedAt). A pending invitation is a row not
 * removed, so a group with one is still going, and a one-to-one chat that
 * one side still has is too. A row is gone as well when its Profile's
 * account is erased.
 */
export const ENDED_CONVERSATION = {
  participants: { none: { deletedAt: null } },
} satisfies Prisma.ConversationWhereInput;

const FILE_ADDRESSES = {
  url: true,
  standardUrl: true,
  thumbnailUrl: true,
} as const;

type Addresses = Record<string, string | null | undefined>;

/**
 * Ends the conversations everybody left: when the last member leaves a
 * group, or both sides of a one-to-one chat have removed it, its messages
 * are erased, and the files they and the group's picture used are kept 30
 * days, readable by their owner only, then erased by the nightly erasure of
 * the files of deleted content.
 */
@Injectable()
export class EndedConversationsErasureService {
  private readonly logger = new Logger(EndedConversationsErasureService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StoredFilesService)
    private readonly storedFiles: StoredFilesService,
  ) {}

  /**
   * Answers how many conversations were erased. Never throws: a conversation
   * that cannot be erased is tried again the next night. Running on two
   * servers at once is harmless: each conversation is erased by whichever
   * holds its row first; the other finds it gone.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async eraseEnded(): Promise<number> {
    let erased = 0;
    let failed = 0;
    let after: string | null = null;
    try {
      for (;;) {
        const page: Array<{ id: string }> =
          await this.prisma.conversation.findMany({
            where: {
              ...ENDED_CONVERSATION,
              ...(after ? { id: { gt: after } } : {}),
            },
            orderBy: { id: 'asc' },
            take: ENDED_PAGE,
            select: { id: true },
          });
        if (page.length === 0) break;
        after = page[page.length - 1].id;
        for (const { id } of page) {
          try {
            if (await this.erase(id)) erased++;
          } catch (error: unknown) {
            failed++;
            this.logger.warn(
              `An ended conversation could not be erased; it is tried again tomorrow: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    } catch (error: unknown) {
      this.logger.error(
        `Erasing ended conversations stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.logger.log(
      `Erased ${erased} conversations everybody left; ${failed} left for tomorrow.`,
    );
    return erased;
  }

  /**
   * Erases one conversation if it has ended, and answers whether it did. Its
   * row is held first, so a member leaving, accepting or writing at that
   * moment waits, and whether anyone is still in it is read again once held:
   * a chat someone wrote in since the page was read is kept.
   */
  async erase(conversationId: string): Promise<boolean> {
    const files = await this.prisma.$transaction(async (tx) => {
      const held = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "conversations" WHERE id = ${conversationId} FOR UPDATE`;
      if (held.length === 0) return null;
      const stillIn = await tx.participant.count({
        where: { conversationId, deletedAt: null },
      });
      if (stillIn > 0) return null;
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: { avatarUrl: true },
      });
      const messages = await tx.message.findMany({
        where: { conversationId },
        select: {
          ...FILE_ADDRESSES,
          voiceUrl: true,
          media: { select: FILE_ADDRESSES },
          voiceMedia: { select: FILE_ADDRESSES },
        },
      });
      // The messages, their reactions and the rows of who is in it go with
      // the conversation.
      await tx.conversation.delete({ where: { id: conversationId } });
      const addresses: Array<string | null | undefined> = [
        conversation?.avatarUrl,
      ];
      for (const { media, voiceMedia, ...message } of messages) {
        for (const row of [
          message,
          media,
          voiceMedia,
        ] as Array<Addresses | null>) {
          if (row) addresses.push(...Object.values(row));
        }
      }
      return addresses;
    }, ERASE_TRANSACTION);
    if (files === null) return false;
    // Settled once the rows are gone, so that no row of the conversation
    // still counts as using a file. A file another row still names stays as
    // it is. If this fails, the conversation is erased all the same; its
    // files, named by no row, show in the nightly report of orphan files.
    try {
      await this.storedFiles.release('', files);
    } catch (error: unknown) {
      this.logger.warn(
        `The files of an erased conversation could not be set aside: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return true;
  }
}
