import { Inject, Injectable } from '@nestjs/common';
import type { MediaStatus, Message, Participant } from '@prisma/client';
import { isUnlisted } from '../../../common/policies/removed-content.policy.js';
import { PUBLIC_PROFILE_SELECT } from '../../../common/selects/public-profile.select.js';
import { CryptoService } from '../../../common/services/crypto.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { blockedWithViewer, maskMessage } from '../../blocked-participants.js';
import { ChatAuthorizationService } from '../../services/chat-authorization.service.js';

// How many messages a conversation shows at first, and how many more each
// time the person scrolls up to the top.
export const MESSAGE_PAGE = 50;

@Injectable()
export class GetMessagesQuery {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
    @Inject(ChatAuthorizationService)
    private chatAuth: ChatAuthorizationService,
  ) {}

  // The latest messages of a conversation, oldest first as they are read.
  // With `before`, the ones sent before that message instead: the app reads
  // further back as the person scrolls up. Notices from the app (someone
  // became admin) only for an app that says it understands them
  // (withNotices): an older one would draw them as empty messages.
  async execute(
    conversationId: string,
    limit = MESSAGE_PAGE,
    profileId?: string,
    before?: { createdAt: Date; id: string },
    withNotices = false,
  ): Promise<(Message & { status: MediaStatus })[]> {
    let isParticipant: Participant | null = null;
    if (profileId) {
      isParticipant = await this.chatAuth.assertParticipant(
        conversationId,
        profileId,
        'You are not a participant in this conversation',
      );
    }

    const whereClause: any = { conversationId };
    if (!withNotices) {
      whereClause.kind = 'USER';
    }
    if (isParticipant?.clearedAt) {
      whereClause.createdAt = { gt: isParticipant.clearedAt };
    }
    if (before) {
      whereClause.OR = [
        { createdAt: { lt: before.createdAt } },
        { createdAt: before.createdAt, id: { lt: before.id } },
      ];
    }

    // Newest first to take the latest ones, then turned to reading order.
    const latest = await this.prisma.message.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        media: true,
        voiceMedia: true,
        post: {
          include: {
            media: true,
            profile: { select: PUBLIC_PROFILE_SELECT },
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
        reactions: {
          include: {
            profile: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    const messages = latest.reverse();
    // Someone in a block with the viewer, either way, shows as unavailable
    // in what they wrote, quoted, shared or reacted with.
    const blocked = await blockedWithViewer(
      this.prisma,
      profileId,
      (messages as any[]).flatMap((m: any) => [
        m.senderId,
        m.replyTo?.senderId,
        m.post?.profileId,
        m.story?.profileId,
        ...(m.reactions ?? []).map((r: any) => r.profileId),
      ]),
    );
    const shown = (messages as any[]).map((input: any) => {
      const m = maskMessage(input, blocked, profileId);
      if (m.content) {
        m.content = this.cryptoService.decrypt(m.content);
      }

      // Prefer the linked Media rows' fields over the legacy inline
      // columns before any redaction below runs, so a message is served
      // consistently regardless of which source the value came from.
      m.url = m.media?.url ?? m.url;
      m.standardUrl = m.media?.standardUrl ?? m.standardUrl ?? null;
      m.thumbnailUrl = m.media?.thumbnailUrl ?? m.thumbnailUrl ?? null;
      m.status = m.media?.status ?? 'READY';
      m.voiceUrl = m.voiceMedia?.url ?? m.voiceUrl;
      delete m.media;
      delete m.voiceMedia;
      // A shared post that moderation removed is kept for its appeal and
      // shown to nobody, one its author deleted is in their Recently
      // deleted, and one they archived is in their archive: the message
      // stays, without the post (shown as unavailable).
      if (m.post && isUnlisted(m.post)) m.post = null;

      // A reply quotes its original: a deleted original shows no file
      // either.
      if (m.replyTo?.isDeleted) {
        m.replyTo.url = null;
        m.replyTo.standardUrl = null;
        m.replyTo.thumbnailUrl = null;
        m.replyTo.mediaType = null;
        m.replyTo.voiceUrl = null;
        m.replyTo.voiceDuration = null;
        m.replyTo.voiceWaveform = null;
        m.replyTo.gif = null;
      }

      // A deleted message shows no file, whatever a row may still name.
      if (m.isDeleted) {
        m.url = null;
        m.standardUrl = null;
        m.thumbnailUrl = null;
        m.mediaType = null;
        m.voiceUrl = null;
        m.voiceDuration = null;
        m.voiceWaveform = null;
        m.gif = null;
      }

      return m;
    });

    return shown as any;
  }
}
