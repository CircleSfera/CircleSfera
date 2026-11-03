import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ScheduleLiveDto } from './dto/schedule-live.dto.js';
import { ScheduledLivesQueryDto } from './dto/scheduled-lives-query.dto.js';
import { LiveScheduleService } from './live-schedule.service.js';

// Lives scheduled ahead of time and the reminders of them, as the Profile
// the session acts as.
@Controller('live/scheduled')
@UseGuards(JwtAuthGuard)
export class LiveScheduleController {
  constructor(private readonly schedule: LiveScheduleService) {}

  @Post()
  @UseGuards(EmailVerifiedGuard)
  @ApiResponse({ status: 201, type: Object })
  scheduleLive(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ScheduleLiveDto,
  ) {
    return this.schedule.schedule(user.profileId, dto);
  }

  @Get()
  @ApiResponse({ status: 200, type: Object, isArray: true })
  listUpcoming(
    @CurrentUser() user: CurrentUserData,
    @Query() query: ScheduledLivesQueryDto,
  ) {
    return this.schedule.listUpcoming(query.profileId, user.profileId);
  }

  @Delete(':id')
  @ApiResponse({ status: 200 })
  cancel(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedule.cancel(user.profileId, id);
  }

  @Post(':id/reminder')
  @ApiResponse({ status: 201 })
  remind(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedule.remind(id, user.profileId);
  }

  @Delete(':id/reminder')
  @ApiResponse({ status: 200 })
  unremind(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedule.unremind(id, user.profileId);
  }
}
