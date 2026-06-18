import {
  Injectable,
  HttpException as NestHttpException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEditDto } from './dto/create-edit.dto.js';
import { UpdateEditDto } from './dto/update-edit.dto.js';

@Injectable()
export class EditsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createEditDto: CreateEditDto) {
    try {
      if (!this.prisma.editProject) {
        throw new Error(
          'Prisma EditProject model is undefined. Prisma client was not generated correctly in production.',
        );
      }
      return await this.prisma.editProject.create({
        data: {
          userId,
          mediaUrl: createEditDto.mediaUrl,
          mediaType: createEditDto.mediaType || 'image',
          name: createEditDto.name,
          state: createEditDto.state,
        },
      });
    } catch (error: any) {
      throw new NestHttpException(
        `Debug Error: ${error?.message || String(error)}`,
        500,
      );
    }
  }

  async findAll(userId: string) {
    return this.prisma.editProject.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const edit = await this.prisma.editProject.findFirst({
      where: { id, userId },
    });

    if (!edit) {
      throw new NotFoundException('Edit project not found');
    }

    return edit;
  }

  async update(userId: string, id: string, updateEditDto: UpdateEditDto) {
    const edit = await this.findOne(userId, id);

    return this.prisma.editProject.update({
      where: { id: edit.id },
      data: {
        name: updateEditDto.name !== undefined ? updateEditDto.name : edit.name,
        state:
          updateEditDto.state !== undefined
            ? updateEditDto.state
            : (edit.state as any),
      },
    });
  }

  async remove(userId: string, id: string) {
    const edit = await this.findOne(userId, id);

    await this.prisma.editProject.delete({
      where: { id: edit.id },
    });

    return { success: true };
  }
}
