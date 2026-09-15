import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AIService } from './ai.service.js';
import { GenerateAltTextDto } from './dto/generate-alt-text.dto.js';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(
    @Inject(AIService)
    private readonly aiService: AIService,
  ) {}

  @Post('alt-text')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  async generateAltText(@Body() body: GenerateAltTextDto) {
    const text = await this.aiService.generateAltText(body.imageUrl);
    return { text };
  }
}
