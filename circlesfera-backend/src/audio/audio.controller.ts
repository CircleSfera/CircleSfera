import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AudioService } from './audio.service.js';
import { CreateAudioDto } from './dto/create-audio.dto.js';

/** REST controller for audio track management. All endpoints require authentication. */
@Controller('audio')
@UseGuards(JwtAuthGuard)
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  /** Create a new audio track. */
  @Post()
  create(@Body() dto: CreateAudioDto) {
    return this.audioService.create(dto);
  }

  /** List all audio tracks. */
  @Get()
  findAll() {
    return this.audioService.findAll();
  }

  /** Search audio tracks by title or artist. */
  @Get('search')
  search(@Query('q') query: string) {
    return this.audioService.search(query);
  }

  /** Get trending audio tracks. */
  @Get('trending')
  getTrending() {
    return this.audioService.getTrending();
  }

  /** Get a single audio track by ID. */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.audioService.findOne(id);
  }

  /** Get all posts using a specific audio track. */
  @Get(':id/posts')
  getPosts(@Param('id') id: string) {
    return this.audioService.getAudioPosts(id);
  }
}
