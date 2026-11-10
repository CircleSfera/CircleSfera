import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import { PostCollaboratorsService } from './post-collaborators.service.js';

// The invited side of a collaboration: the signed-in Profile's invitations,
// and accepting, declining or leaving one. Team members answer for a
// Business Profile when they may manage its content.
@Controller('collaborations')
@UseGuards(JwtAuthGuard)
export class CollaborationsController {
  constructor(
    @Inject(PostCollaboratorsService)
    private readonly collaborators: PostCollaboratorsService,
  ) {}

  @Get('invitations')
  @MemberAllowed('content.manage')
  @ApiResponse({ status: 200 })
  async invitations(@CurrentUser() user: CurrentUserData) {
    return this.collaborators.invitations(user.profileId);
  }

  @Post(':postId/accept')
  @MemberAllowed('content.manage')
  @ApiResponse({ status: 201 })
  async accept(
    @CurrentUser() user: CurrentUserData,
    @Param('postId') postId: string,
  ) {
    return this.collaborators.accept(user.profileId, postId);
  }

  // Declining an invitation and leaving an accepted collaboration are the
  // same: the post is its author's alone again.
  @Delete(':postId')
  @MemberAllowed('content.manage')
  @ApiResponse({ status: 200 })
  async leave(
    @CurrentUser() user: CurrentUserData,
    @Param('postId') postId: string,
  ) {
    return this.collaborators.leave(user.profileId, postId);
  }
}
