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
import { ChatService } from './chat.service.js';
import { ChatProcessor } from './processors/chat.processor.js';

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
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ChatService, CryptoService, ChatProcessor],
  controllers: [ChatController],
  exports: [ChatService],
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
