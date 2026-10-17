import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { InviteMemberDto } from './dto/invite-member.dto.js';
import { MemberAllowed } from './member-allowed.decorator.js';
import { TeamService } from './team.service.js';

// Team access to a Business Profile (ADR-0028). The owner's side works on
// the Profile of the session; the invited person's side on their account.
@Controller('team')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Get()
  @MemberAllowed('team.manage')
  get(@CurrentUser() user: CurrentUserData) {
    return this.team.team(user.userId, user.profileId);
  }

  @Post('members')
  @MemberAllowed('team.manage')
  invite(@CurrentUser() user: CurrentUserData, @Body() dto: InviteMemberDto) {
    return this.team.invite(user.userId, user.profileId, dto);
  }

  @Delete('members/:id')
  @MemberAllowed('team.manage')
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.remove(user.userId, user.profileId, id);
  }

  // What was done on the Profile and by whom, for its owner.
  @Get('activity')
  @MemberAllowed('team.manage')
  activity(@CurrentUser() user: CurrentUserData, @Query() page: PaginationDto) {
    return this.team.activity(
      user.userId,
      user.profileId,
      page.page ?? 1,
      page.limit ?? 10,
    );
  }

  // The Profiles the person works on as a team member.
  @Get('profiles')
  @MemberAllowed('session')
  profiles(@CurrentUser() user: CurrentUserData) {
    return this.team.memberProfiles(user.userId);
  }

  @Get('invitations')
  @MemberAllowed('session')
  invitations(@CurrentUser() user: CurrentUserData) {
    return this.team.invitations(user.userId);
  }

  @Post('invitations/:id/accept')
  @MemberAllowed('session')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.accept(user.userId, id, user.signInId);
  }

  @Post('invitations/:id/decline')
  @MemberAllowed('session')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.decline(user.userId, id);
  }
}
