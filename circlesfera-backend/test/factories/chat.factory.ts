import type { Conversation, Message, PrismaClient } from '@prisma/client';
import { generateTestSuffix } from './user.factory.js';

/**
 * Create a direct 1-to-1 conversation between two profiles.
 */
export async function createDirectConversation(
  prisma: PrismaClient,
  profileAId: string,
  profileBId: string,
): Promise<Conversation> {
  return prisma.conversation.create({
    data: {
      isGroup: false,
      participants: {
        create: [{ profileId: profileAId }, { profileId: profileBId }],
      },
    },
  });
}

/**
 * Send a message within an existing conversation.
 */
export async function createMessage(
  prisma: PrismaClient,
  conversationId: string,
  senderProfileId: string,
  content?: string,
): Promise<Message> {
  const suffix = generateTestSuffix();
  return prisma.message.create({
    data: {
      conversationId,
      senderId: senderProfileId,
      content: content ?? `Test message #${suffix}`,
    },
  });
}
