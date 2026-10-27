import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { APPEAL_WINDOW_MONTHS } from '../../appeals/appeal-window.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StoredFilesService } from '../../uploads/services/stored-files.service.js';

const ENDED_PAGE = 100;
const MESSAGE_PAGE = 1000;

// Erasing one conversation reads its messages and deletes it with them; a
// long one may take a while, and it must not wait long for its row.
const ERASE_TRANSACTION = { timeout: 30_000, maxWait: 5_000 };

/**
 * The moment before which a decision on a report can no longer be appealed:
 * a report resolved since then may still need the reported message.
 */
export function reportsKeptSince(now: Date): Date {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - APPEAL_WINDOW_MONTHS);
  return since;
}

/**
 * Whether the conversation `c` may be erased, as a condition of a query on
 * "conversations" c.
 *
 * Nobody is in it any more: none of its rows is one its Profile still has.
 * A member who leaves a group or is removed from it loses their row; a
 * Profile that deletes a one-to-one chat, or declines an invitation, keeps a
 * row marked removed (deletedAt). A pending invitation is a row not removed,
 * so a group with one is still going, and a one-to-one chat that one side
 * still has is too. A row is gone as well when its Profile's account is
 * erased.
 *
 * And nothing in it must be kept: a paid message, or one someone paid to
 * unlock, keeps the conversation for its purchase records; a reported
 * message keeps it while the report is open, and for as long as the decision
 * on it can be appealed, so staff can still read it and sanction its sender.
 */
export function erasableConversation(now: Date): Prisma.Sql {
  return Prisma.sql`
    NOT EXISTS (
      SELECT 1 FROM "participants" p
      WHERE p."conversationId" = c.id AND p."deletedAt" IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM "messages" m
      WHERE m."conversationId" = c.id
        AND (
          m."isLocked"
          OR EXISTS (SELECT 1 FROM "message_unlocks" u WHERE u."messageId" = m.id)
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM "reports" r
      JOIN "messages" m ON m.id = r."targetId"
      WHERE m."conversationId" = c.id
        AND r."targetType" = 'MESSAGE'
        AND (
          r."status" IN ('PENDING', 'REVIEWING')
          OR r."resolvedAt" IS NULL
          OR r."resolvedAt" > ${reportsKeptSince(now)}
        )
    )`;
}

const FILE_ADDRESSES = {
  url: true,
  standardUrl: true,
  thumbnailUrl: true,
} as const;

type Addresses = Record<string, string | null | undefined>;

interface MessageFiles {
  id: string;
  url: string | null;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  voiceUrl: string | null;
  media: Addresses | null;
  voiceMedia: Addresses | null;
}

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
  async eraseEnded(now: Date = new Date()): Promise<number> {
    let erased = 0;
    let failed = 0;
    let after: string | null = null;
    try {
      for (;;) {
        const page: Array<{ id: string }> = await this.prisma.$queryRaw`
          SELECT c.id FROM "conversations" c
          WHERE ${after === null ? Prisma.sql`TRUE` : Prisma.sql`c.id > ${after}`}
            AND ${erasableConversation(now)}
          ORDER BY c.id ASC
          LIMIT ${ENDED_PAGE}`;
        if (page.length === 0) break;
        after = page[page.length - 1].id;
        for (const { id } of page) {
          try {
            if (await this.erase(id, now)) erased++;
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
   * Erases one conversation if it may be erased, and answers whether it did.
   * Its row is held first, so a member leaving, accepting or writing at that
   * moment waits, and whether it may be erased is read again once held: a
   * chat someone wrote in, paid in or reported since the page was read is
   * kept.
   */
  async erase(
    conversationId: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const files = await this.prisma.$transaction(async (tx) => {
      const held = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "conversations" WHERE id = ${conversationId} FOR UPDATE`;
      if (held.length === 0) return null;
      const erasable = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT c.id FROM "conversations" c
        WHERE c.id = ${conversationId} AND ${erasableConversation(now)}`;
      if (erasable.length === 0) return null;
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: { avatarUrl: true },
      });
      const addresses: Array<string | null | undefined> = [
        conversation?.avatarUrl,
      ];
      // Only the addresses of the files are read, a page at a time.
      let afterMessage: string | null = null;
      for (;;) {
        const messages: MessageFiles[] = await tx.message.findMany({
          where: {
            conversationId,
            ...(afterMessage === null ? {} : { id: { gt: afterMessage } }),
          },
          orderBy: { id: 'asc' },
          take: MESSAGE_PAGE,
          select: {
            id: true,
            ...FILE_ADDRESSES,
            voiceUrl: true,
            media: { select: FILE_ADDRESSES },
            voiceMedia: { select: FILE_ADDRESSES },
          },
        });
        for (const { id, media, voiceMedia, ...message } of messages) {
          afterMessage = id;
          for (const row of [
            message,
            media,
            voiceMedia,
          ] as Array<Addresses | null>) {
            if (row) addresses.push(...Object.values(row));
          }
        }
        if (messages.length < MESSAGE_PAGE) break;
      }
      // The messages, their reactions and the rows of who is in it go with
      // the conversation.
      await tx.conversation.delete({ where: { id: conversationId } });
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
