import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ApplyMonetizationDto } from './dto/apply-monetization.dto.js';
import { MonetizationProgrammeService } from './monetization-programme.service.js';

interface AuthRequest extends Request {
  user: CurrentUserData;
}

// The active Profile's place in the monetization programme.
@ApiTags('Monetization')
@Controller('monetization/programme')
@UseGuards(JwtAuthGuard)
export class MonetizationProgrammeController {
  constructor(
    @Inject(MonetizationProgrammeService)
    private readonly programme: MonetizationProgrammeService,
  ) {}

  @Get()
  @ApiResponse({ status: 200 })
  status(@Req() req: AuthRequest) {
    return this.programme.statusOf(req.user.userId, req.user.profileId);
  }

  @Post('apply')
  @UseGuards(IdentityVerifiedGuard)
  @ApiResponse({ status: 201 })
  apply(@Req() req: AuthRequest, @Body() dto: ApplyMonetizationDto) {
    return this.programme.apply(req.user.userId, req.user.profileId, dto.pitch);
  }
}
