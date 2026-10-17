import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityInterceptor } from './activity.interceptor.js';
import { MemberSessionInterceptor } from './member-session.interceptor.js';
import { ProfileAccessService } from './profile-access.service.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

// Team access to a Business Profile (ADR-0028).
@Module({
  controllers: [TeamController],
  providers: [
    ProfileAccessService,
    TeamService,
    // Member sessions are closed everywhere but the routes marked for them.
    { provide: APP_INTERCEPTOR, useClass: MemberSessionInterceptor },
    // Content actions on a Business Profile keep the person who took them.
    { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor },
  ],
  exports: [ProfileAccessService],
})
export class TeamModule {}
