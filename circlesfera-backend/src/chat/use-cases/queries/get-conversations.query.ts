import { Inject, Injectable } from '@nestjs/common';
import { CryptoService } from '../../../common/services/crypto.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

// Hard cap on the conversation list — this endpoint returns a plain array
// (not createPaginatedResult) to keep the existing API contract, so bounding
// is a fixed take rather than page/limit params (DATA-002). Ordered by
// updatedAt desc, so the most recently active conversations are the ones
// that would ever fall outside this cap.
const MAX_CONVERSATIONS = 100;

@Injectable()
export class GetConversationsQuery {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
  ) {}

  async execute(profileId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            profileId,
            deletedAt: null,
          },
        },
      },
      take: MAX_CONVERSATIONS,
      include: {
        participants: {
          include: {
            profile: {
              select: {
                id: true,
                username: true,
                avatar: true,
                fullName: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          include: {
            post: {
              include: {
                media: true,
                profile: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                    thumbnailUrl: true,
                    standardUrl: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const decryptedConversations = conversations.map((conv) => {
      if (conv.messages?.length > 0) {
        const lastMsg = conv.messages[0];
        if (lastMsg.content) {
          lastMsg.content = this.cryptoService.decrypt(lastMsg.content);
        }
      }
      return conv;
    });

    return decryptedConversations;
  }
}
