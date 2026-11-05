import { forwardRef, Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StripeModule } from '../common/stripe/stripe.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { UsersModule } from '../users/users.module.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

@Module({
  imports: [
    UploadsModule,
    AIModule,
    UsersModule,
    StripeModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
