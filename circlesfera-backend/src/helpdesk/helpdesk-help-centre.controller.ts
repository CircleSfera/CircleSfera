import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { HelpCentreQueryDto } from './dto/help-centre-query.dto.js';
import { HelpdeskHelpCentreService } from './helpdesk-help-centre.service.js';

// The help centre, for anyone: no session, read only, published articles
// only. The organization is the host's; it never comes from the request.
@Controller('help/articles')
export class HelpdeskHelpCentreController {
  constructor(
    @Inject(HelpdeskHelpCentreService)
    private readonly helpCentre: HelpdeskHelpCentreService,
  ) {}

  @Get()
  @Throttle({
    short: { limit: 10, ttl: 1000 },
    medium: { limit: 120, ttl: 60000 },
  })
  async list(@Query() query: HelpCentreQueryDto) {
    return this.helpCentre.list(query);
  }

  @Get(':slug')
  @Throttle({
    short: { limit: 10, ttl: 1000 },
    medium: { limit: 120, ttl: 60000 },
  })
  async article(
    @Param('slug') slug: string,
    @Query() query: HelpCentreQueryDto,
  ) {
    return this.helpCentre.article(slug, query.locale);
  }
}
