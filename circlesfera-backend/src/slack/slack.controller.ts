import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SlackGuard } from './slack.guard.js';
import { SlackService } from './slack.service.js';

@Controller('slack')
@UseGuards(SlackGuard)
export class SlackController {
  constructor(private readonly slackService: SlackService) {}

  @Post('commands')
  @HttpCode(HttpStatus.OK)
  async handleCommands(@Body() body: any) {
    if (body.command === '/cs-stats') {
      return this.slackService.handleStatsCommand();
    }
    return { text: `Command not recognized: ${body.command}` };
  }

  @Post('interactions')
  @HttpCode(HttpStatus.OK)
  async handleInteractions(@Body() body: any) {
    if (!body.payload) {
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(body.payload);
    } catch (_e) {
      return { text: 'Invalid payload JSON' };
    }

    // Process interaction asynchronously and return 200 OK immediately
    // to prevent Slack from showing a timeout error to the user
    this.slackService
      .handleModerationInteraction(payload)
      .catch((e) => console.error('Failed to handle interaction', e));

    return;
  }
}
