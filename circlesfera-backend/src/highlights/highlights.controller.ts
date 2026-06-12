import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { CreateHighlightDto } from './dto/create-highlight.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { UpdateHighlightDto } from './dto/update-highlight.dto.js';
import { HighlightsService } from './highlights.service.js';

interface RequestWithUser {
  user: {
    userId: string;
  };
}

/** REST controller for story highlights. Create/delete require authentication. */
@Controller('highlights')
export class HighlightsController {
  constructor(
    @Inject(HighlightsService)
    private readonly highlightsService: HighlightsService,
  ) {}

  /** Create a new highlight from selected stories (requires auth). */
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Request() req: RequestWithUser,
    @Body() createHighlightDto: CreateHighlightDto,
  ) {
    return this.highlightsService.create(req.user.userId, createHighlightDto);
  }

  /** Update a highlight (requires auth). */
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateHighlightDto: UpdateHighlightDto,
  ) {
    return this.highlightsService.update(
      id,
      req.user.userId,
      updateHighlightDto,
    );
  }

  /** List all highlights for a specific user. */
  @Get('user/:userId')
  findAll(@Param('userId') userId: string) {
    return this.highlightsService.findAll(userId);
  }

  /** Get a single highlight by ID. */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.highlightsService.findOne(id);
  }

  /** Delete a highlight (requires auth). */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.highlightsService.remove(req.user.userId, id);
  }
}
