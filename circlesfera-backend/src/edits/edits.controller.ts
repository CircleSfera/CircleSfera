import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Put,
} from '@nestjs/common';
import { EditsService } from './edits.service.js';
import { CreateEditDto } from './dto/create-edit.dto.js';
import { UpdateEditDto } from './dto/update-edit.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface RequestWithUser {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('edits')
@UseGuards(JwtAuthGuard)
export class EditsController {
  constructor(private readonly editsService: EditsService) {}

  @Post()
  create(@Request() req: RequestWithUser, @Body() createEditDto: CreateEditDto) {
    return this.editsService.create(req.user.id, createEditDto);
  }

  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.editsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.editsService.findOne(req.user.id, id);
  }

  @Put(':id')
  update(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateEditDto: UpdateEditDto,
  ) {
    return this.editsService.update(req.user.id, id, updateEditDto);
  }

  @Delete(':id')
  remove(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.editsService.remove(req.user.id, id);
  }
}
