import { Inject, Injectable } from '@nestjs/common';
import { GetConversationsQuery } from './get-conversations.query.js';

@Injectable()
export class GetUnreadCountQuery {
  constructor(
    @Inject(GetConversationsQuery)
    private readonly getConversationsQuery: GetConversationsQuery,
  ) {}

  async execute(userId: string): Promise<number> {
    const conversations = await this.getConversationsQuery.execute(userId);
    let unreadCount = 0;

    for (const conv of conversations as {
      messages?: any[];
      participants: any[];
    }[]) {
      const lastMsg = conv.messages?.[0];
      if (!lastMsg) continue;

      if (lastMsg.senderId === userId) continue;

      const myParticipant = conv.participants.find(
        (p: any) => p.userId === userId,
      );

      if (
        !myParticipant?.lastReadAt ||
        new Date(lastMsg.createdAt).getTime() >
          new Date(myParticipant.lastReadAt).getTime()
      ) {
        unreadCount++;
      }
    }

    return unreadCount;
  }
}
