import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArticleFeedbackDto } from './dto/article-feedback.dto.js';
import { HelpCentreQueryDto } from './dto/help-centre-query.dto.js';
import { HelpdeskHelpCentreService } from './helpdesk-help-centre.service.js';

// The help centre, for anyone: no session, published articles only. It is
// read; the one thing written is whether an article helped. The organization is the host's; it never comes from the request.
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

  // The counts are a signal, not a vote: a few answers a minute from one
  // address, across all articles.
  @Post(':slug/feedback')
  @HttpCode(204)
  @Throttle({
    short: { limit: 2, ttl: 1000 },
    medium: { limit: 10, ttl: 60000 },
  })
  async feedback(
    @Param('slug') slug: string,
    @Body() body: ArticleFeedbackDto,
  ): Promise<void> {
    await this.helpCentre.feedback(slug, body.useful);
  }
}
