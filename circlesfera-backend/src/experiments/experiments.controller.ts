import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { ExperimentsService } from './experiments.service.js';

@Controller('experiments')
export class ExperimentsController {
  constructor(private readonly experimentsService: ExperimentsService) {}

  @UseGuards(JwtOptionalGuard)
  @Get('my-flags')
  async getMyFlags(@Req() req: { user?: { userId?: string } }) {
    const userId = req.user?.userId || null;
    return this.experimentsService.getMyFlags(userId);
  }
}
