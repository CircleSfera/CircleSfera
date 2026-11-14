import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatModule } from '../chat/chat.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WebrtcModule } from '../webrtc/webrtc.module.js';
import { AppGateway } from './app.gateway.js';
import { ChatRealtimeService } from './services/chat-realtime.service.js';
import { LiveRealtimeService } from './services/live-realtime.service.js';
import { SocketAuthService } from './services/socket-auth.service.js';
import { SocketPresenceService } from './services/socket-presence.service.js';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    ChatModule,
    WebrtcModule,
  ],
  providers: [
    AppGateway,
    SocketAuthService,
    SocketPresenceService,
    ChatRealtimeService,
    LiveRealtimeService,
  ],
  exports: [
    AppGateway,
    SocketAuthService,
    SocketPresenceService,
    ChatRealtimeService,
    LiveRealtimeService,
  ],
})
export class SocketModule {}
