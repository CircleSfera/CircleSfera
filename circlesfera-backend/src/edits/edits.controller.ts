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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateEditDto } from './dto/create-edit.dto.js';
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
