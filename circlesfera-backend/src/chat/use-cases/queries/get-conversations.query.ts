import { Inject, Injectable } from '@nestjs/common';
import { CryptoService } from '../../../common/services/crypto.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

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
