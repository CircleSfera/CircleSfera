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
  UseGuards,
} from '@nestjs/common';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { InviteMemberDto } from './dto/invite-member.dto.js';
import { TeamService } from './team.service.js';

// Team access to a Business Profile (ADR-0028). The owner's side works on
// the Profile of the session; the invited person's side on their account.
@Controller('team')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Get()
  get(@CurrentUser() user: CurrentUserData) {
    return this.team.team(user.userId, user.profileId);
  }

  @Post('members')
  invite(@CurrentUser() user: CurrentUserData, @Body() dto: InviteMemberDto) {
    return this.team.invite(user.userId, user.profileId, dto);
  }

  @Delete('members/:id')
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.remove(user.userId, user.profileId, id);
  }

  @Get('invitations')
  invitations(@CurrentUser() user: CurrentUserData) {
    return this.team.invitations(user.userId);
  }

  @Post('invitations/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.accept(user.userId, id, user.signInId);
  }

  @Post('invitations/:id/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.team.decline(user.userId, id);
  }
}
