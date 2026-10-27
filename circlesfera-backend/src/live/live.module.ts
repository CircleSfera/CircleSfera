import { forwardRef, Module } from '@nestjs/common';
import { StripeModule } from '../common/stripe/stripe.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SocketModule } from '../socket/socket.module.js';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';
import { LiveGiftService } from './live-gift.service.js';
import { LiveKitTokenService } from './live-kit-token.service.js';
import { LiveStartNoticeService } from './live-start-notice.service.js';
import { LiveRecordingModule } from './recording/live-recording.module.js';

@Module({
  imports: [
    PrismaModule,
    StripeModule,
    NotificationsModule,
    LiveRecordingModule,
    forwardRef(() => SocketModule),
  ],
  controllers: [LiveController],
  providers: [
    LiveService,
    LiveGiftService,
    LiveKitTokenService,
    LiveStartNoticeService,
  ],
  exports: [LiveService, LiveGiftService],
})
export class LiveModule {}
