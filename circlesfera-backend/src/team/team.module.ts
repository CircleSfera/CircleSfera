import { Module } from '@nestjs/common';
import { ProfileAccessService } from './profile-access.service.js';

// Team access to a Business Profile (ADR-0028).
@Module({
  providers: [ProfileAccessService],
  exports: [ProfileAccessService],
})
export class TeamModule {}
