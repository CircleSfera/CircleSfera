import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { PostType, Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { assertCanAccessPost } from '../common/policies/post-access.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateStudioTemplateDto } from './dto/create-studio-template.dto.js';
import type { UpdateStudioTemplateDto } from './dto/update-studio-template.dto.js';
import {
  InvalidTemplateError,
  type TemplateStructure,
  templateStructureOf,
} from './template-structure.js';

/** What a person sees of their own template. */
const OWN_SELECT = {
  id: true,
  name: true,
  structure: true,
  postId: true,
  isPublic: true,
  uses: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StudioTemplateSelect;

@Injectable()
export class StudioTemplatesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Saves a template of the Profile's, rebuilt from what was sent. One
   * offered from a Frame must be the Profile's own Frame; saving again for
   * that Frame replaces its template.
   */
  async create(profileId: string, dto: CreateStudioTemplateDto) {
    const structure = await this.checkedStructure(dto.structure, dto.name);
    if (!dto.postId) {
      return this.prisma.studioTemplate.create({
        data: {
          profileId,
          name: dto.name,
          structure: structure as unknown as Prisma.InputJsonValue,
          isPublic: false,
        },
        select: OWN_SELECT,
      });
    }
    await this.assertOwnFrame(profileId, dto.postId);
    const data = {
      name: dto.name,
      structure: structure as unknown as Prisma.InputJsonValue,
      isPublic: dto.isPublic ?? false,
    };
    return this.prisma.studioTemplate.upsert({
      where: { postId: dto.postId },
      create: { profileId, postId: dto.postId, ...data },
      update: data,
      select: OWN_SELECT,
    });
  }

  /** The Profile's own templates, the latest first. */
  mine(profileId: string) {
    return this.prisma.studioTemplate.findMany({
      where: { profileId },
      orderBy: { updatedAt: 'desc' },
      select: OWN_SELECT,
    });
  }

  /**
   * Renames a template of the Profile's, or offers it or stops offering it.
   * Only one offered from a Frame can be offered.
   */
  async update(profileId: string, id: string, dto: UpdateStudioTemplateDto) {
    const template = await this.own(profileId, id);
    if (dto.isPublic && !template.postId) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_INPUT,
        'Only a template offered from a Frame can be public',
      );
    }
    return this.prisma.studioTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
      },
      select: OWN_SELECT,
    });
  }

  async remove(profileId: string, id: string) {
    await this.own(profileId, id);
    await this.prisma.studioTemplate.delete({ where: { id } });
  }

  /**
   * The template offered from a Frame, for someone who can see the Frame:
   * the Frame's own rules of who can see it apply.
   */
  async forPost(postId: string, viewerProfileId?: string | null) {
    await assertCanAccessPost(this.prisma, postId, viewerProfileId);
    const template = await this.prisma.studioTemplate.findUnique({
      where: { postId },
      select: {
        id: true,
        name: true,
        structure: true,
        uses: true,
        isPublic: true,
        profileId: true,
        profile: { select: { username: true } },
      },
    });
    if (
      !template ||
      (!template.isPublic && template.profileId !== viewerProfileId)
    ) {
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Template not found');
    }
    return {
      id: template.id,
      name: template.name,
      structure: template.structure,
      uses: template.uses,
      postId,
      author: { username: template.profile.username },
    };
  }

  /**
   * Counts a Profile's use of a template, once each. The template must be
   * one they can use: their own, or one offered from a Frame they can see.
   */
  async use(profileId: string, templateId: string) {
    const template = await this.usable(profileId, templateId);
    try {
      const [, counted] = await this.prisma.$transaction([
        this.prisma.studioTemplateUse.create({
          data: { templateId, profileId },
        }),
        this.prisma.studioTemplate.update({
          where: { id: templateId },
          data: { uses: { increment: 1 } },
          select: { uses: true },
        }),
      ]);
      return { uses: counted.uses };
    } catch (error: unknown) {
      // Used before: the count stays.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { uses: template.uses };
      }
      throw error;
    }
  }

  /**
   * A template the Profile can use, or an error: their own, or one offered
   * from a Frame they can see.
   */
  async usable(profileId: string, templateId: string) {
    const template = await this.prisma.studioTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        profileId: true,
        postId: true,
        isPublic: true,
        uses: true,
      },
    });
    if (!template) {
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Template not found');
    }
    if (template.profileId === profileId) return template;
    if (!template.isPublic || !template.postId) {
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Template not found');
    }
    await assertCanAccessPost(this.prisma, template.postId, profileId);
    return template;
  }

  private async own(profileId: string, id: string) {
    const template = await this.prisma.studioTemplate.findFirst({
      where: { id, profileId },
      select: { id: true, postId: true },
    });
    if (!template) {
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Template not found');
    }
    return template;
  }

  private async assertOwnFrame(profileId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { profileId: true, type: true, deletedAt: true },
    });
    if (!post || post.deletedAt || post.profileId !== profileId) {
      throw AppException.NotFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
    }
    if (post.type !== PostType.FRAME) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_INPUT,
        'A template is offered from a Frame',
      );
    }
  }

  /**
   * The structure rebuilt from what was sent, its song checked against the
   * audio library: kept only at the song's own address, with its own title.
   */
  private async checkedStructure(
    input: unknown,
    name: string,
  ): Promise<TemplateStructure> {
    let structure: TemplateStructure;
    try {
      structure = templateStructureOf(input, name);
    } catch (error: unknown) {
      if (error instanceof InvalidTemplateError) {
        throw AppException.BadRequest(ErrorCode.INVALID_INPUT, error.message);
      }
      throw error;
    }
    if (!structure.song) return structure;
    const song = await this.prisma.audio.findUnique({
      where: { id: structure.song.audioId },
      select: { url: true, title: true },
    });
    if (!song || song.url !== structure.song.url) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_INPUT,
        'A template’s song must be a song of the audio library',
      );
    }
    return { ...structure, song: { ...structure.song, title: song.title } };
  }
}
