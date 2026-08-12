import { BullModule, InjectQueue } from '@nestjs/bullmq';
import {
  forwardRef,
  Logger,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Queue } from 'bullmq';

import { CryptoService } from '../common/services/crypto.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PushModule } from '../push/push.module.js';
import { SocketModule } from '../socket/socket.module.js';

import { ChatController } from './chat.controller.js';
import { ChatProcessor } from './processors/chat.processor.js';
// Group Commands
import { CreateGroupUseCase } from './use-cases/groups/create-group.use-case.js';
import { DeleteConversationUseCase } from './use-cases/groups/delete-conversation.use-case.js';
import { LeaveGroupUseCase } from './use-cases/groups/leave-group.use-case.js';
import { RemoveParticipantUseCase } from './use-cases/groups/remove-participant.use-case.js';
import { UpdateGroupUseCase } from './use-cases/groups/update-group.use-case.js';
// Message Commands
import { AddReactionUseCase } from './use-cases/messages/add-reaction.use-case.js';
import { DeleteMessageUseCase } from './use-cases/messages/delete-message.use-case.js';
import { EditMessageUseCase } from './use-cases/messages/edit-message.use-case.js';
import { MarkAsReadUseCase } from './use-cases/messages/mark-as-read.use-case.js';
import { SendMessageUseCase } from './use-cases/messages/send-message.use-case.js';
// Queries
import { GetConversationsQuery } from './use-cases/queries/get-conversations.query.js';
import { GetMessagesQuery } from './use-cases/queries/get-messages.query.js';
import { GetUnreadCountQuery } from './use-cases/queries/get-unread-count.query.js';

// System Commands
import { CleanupExpiredMessagesUseCase } from './use-cases/system/cleanup-expired-messages.use-case.js';
import { HandleUserDeletedUseCase } from './use-cases/system/handle-user-deleted.use-case.js';

const useCases = [
  GetConversationsQuery,
  GetMessagesQuery,
  GetUnreadCountQuery,
  AddReactionUseCase,
  DeleteMessageUseCase,
  EditMessageUseCase,
  MarkAsReadUseCase,
  SendMessageUseCase,
  CreateGroupUseCase,
  DeleteConversationUseCase,
  LeaveGroupUseCase,
  RemoveParticipantUseCase,
  UpdateGroupUseCase,
  CleanupExpiredMessagesUseCase,
  HandleUserDeletedUseCase,
];

@Module({
  imports: [
    PrismaModule,
    PushModule,
    ConfigModule,
    BullModule.registerQueue({
      name: 'chat-processing',
    }),
    forwardRef(() => SocketModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [...useCases, CryptoService, ChatProcessor],
  controllers: [ChatController],
  exports: [AddReactionUseCase], // Exported for AppGateway
})
export class ChatModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChatModule.name);

  constructor(
    @InjectQueue('chat-processing') private readonly chatQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.chatQueue.add(
      'cleanup-expired-messages',
      {},
      {
        repeat: { pattern: '0 * * * *' }, // EVERY_HOUR
        jobId: 'chat_cleanup_cron',
      },
    );
    this.logger.log(
      'Registered repeatable job: cleanup-expired-messages (0 * * * *)',
    );
  }
}
