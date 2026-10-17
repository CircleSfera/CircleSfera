import { Module } from '@nestjs/common';
import { ProfileAccessService } from './profile-access.service.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

// Team access to a Business Profile (ADR-0028).
@Module({
  controllers: [TeamController],
  providers: [ProfileAccessService, TeamService],
  exports: [ProfileAccessService],
})
export class TeamModule {}
