import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto.js';
import { HelpdeskArticlesService } from './helpdesk-articles.service.js';

// Writing the help centre: behind the staff session and the permission of
// who leads support.
@Controller('admin/support/articles')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('support.manage')
export class HelpdeskArticlesController {
  constructor(
    @Inject(HelpdeskArticlesService)
    private readonly articles: HelpdeskArticlesService,
  ) {}

  // Drafts and published, with how many readers found each useful.
  @Get()
  async list() {
    return this.articles.list();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.articles.get(id);
  }

  @Post()
  async create(
    @Body() dto: CreateArticleDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.articles.create(admin.adminId, dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articles.update(id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.articles.publish(admin.adminId, id);
  }

  @Post(':id/take-back')
  @HttpCode(HttpStatus.OK)
  async takeBack(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.articles.takeBack(admin.adminId, id);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.articles.remove(admin.adminId, id);
  }
}
