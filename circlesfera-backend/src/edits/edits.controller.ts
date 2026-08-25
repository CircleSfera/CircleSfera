import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateEditDto } from './dto/create-edit.dto.js';
import { GenerateCaptionsDto } from './dto/generate-captions.dto.js';
import { UpdateEditDto } from './dto/update-edit.dto.js';
import { EditsService } from './edits.service.js';

interface RequestWithUser {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('edits')
@UseGuards(JwtAuthGuard)
export class EditsController {
  constructor(private readonly editsService: EditsService) {}

  @Post()
  create(
    @Request() req: RequestWithUser,
    @Body() createEditDto: CreateEditDto,
  ) {
    return this.editsService.create(req.user.userId, createEditDto);
  }

  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.editsService.findAll(req.user.userId);
  }

  @Post(':id/captions')
  @Throttle({ short: { limit: 3, ttl: 3600000 } })
  startCaptions(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: GenerateCaptionsDto,
  ) {
    return this.editsService.startCaptions(req.user.userId, id, body.clipId);
  }

  @Get(':id/captions/:jobId')
  getCaptionsJob(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ) {
    return this.editsService.getCaptionsJob(req.user.userId, id, jobId);
  }

  @Get(':id')
  findOne(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.editsService.findOne(req.user.userId, id);
  }

  @Put(':id')
  update(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateEditDto: UpdateEditDto,
  ) {
    return this.editsService.update(req.user.userId, id, updateEditDto);
  }

  @Delete(':id')
  remove(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.editsService.remove(req.user.userId, id);
  }
}
