import { Inject, Injectable } from '@nestjs/common';
import { GetConversationsQuery } from './get-conversations.query.js';

@Injectable()
export class GetUnreadCountQuery {
  constructor(
    @Inject(GetConversationsQuery)
    private readonly getConversationsQuery: GetConversationsQuery,
  ) {}

  async execute(profileId: string): Promise<number> {
    const conversations = await this.getConversationsQuery.execute(profileId);
    let unreadCount = 0;

    for (const conv of conversations as {
      messages?: any[];
      participants: any[];
    }[]) {
      const lastMsg = conv.messages?.[0];
      if (!lastMsg) continue;

      if (lastMsg.senderId === profileId) continue;

      const myParticipant = conv.participants.find(
        (p: any) => p.profileId === profileId,
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
