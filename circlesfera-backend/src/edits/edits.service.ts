import { ErrorCode } from '@circlesfera/shared';
import { InjectQueue } from '@nestjs/bullmq';
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  HttpException as NestHttpException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AIService } from '../ai/ai.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StoredFilesService } from '../uploads/services/stored-files.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { CreateEditDto } from './dto/create-edit.dto.js';
import { UpdateEditDto } from './dto/update-edit.dto.js';

const CAPTIONS_FLAG = 'studio_ai_captions';

@Injectable()
export class EditsService {
  private readonly logger = new Logger(EditsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(UploadsService) private readonly uploadsService: UploadsService,
    @Inject(AIService) private readonly aiService: AIService,
    @InjectQueue('ai-processing') private readonly aiQueue: Queue,
    @Inject(StoredFilesService)
    private readonly storedFiles: StoredFilesService,
  ) {}

  async create(profileId: string, createEditDto: CreateEditDto) {
    // Only the sending Profile's own stored files can be attached.
    await this.storedFiles.assertOwnedBy(profileId, [
      createEditDto.mediaUrl,
      ...this.collectStudioMediaUrls(createEditDto.state),
    ]);
    try {
      if (!this.prisma.editProject) {
        throw new Error(
          'Prisma EditProject model is undefined. Prisma client was not generated correctly in production.',
        );
      }
      return await this.prisma.editProject.create({
        data: {
          profileId,
          mediaUrl: createEditDto.mediaUrl,
          mediaType: createEditDto.mediaType || 'image',
          name: createEditDto.name,
          state: createEditDto.state,
        },
      });
    } catch (error: unknown) {
      this.logger.error('Failed to create edit project', error);
      throw new NestHttpException(
        {
          errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Failed to create edit project',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(profileId: string) {
    return this.prisma.editProject.findMany({
      where: { profileId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(profileId: string, id: string) {
    const edit = await this.prisma.editProject.findFirst({
      where: { id, profileId },
    });

    if (!edit) {
      throw AppException.NotFound(
        ErrorCode.EDIT_PROJECT_NOT_FOUND,
        'Edit project not found',
      );
    }

    return edit;
  }

  async update(profileId: string, id: string, updateEditDto: UpdateEditDto) {
    const edit = await this.findOne(profileId, id);
    // A clip added must be the Profile's own stored file; the clips the
    // project already has are sent back as they are.
    const kept = new Set(this.collectStudioMediaUrls(edit.state));
    await this.storedFiles.assertOwnedBy(
      profileId,
      this.collectStudioMediaUrls(updateEditDto.state).filter(
        (url) => !kept.has(url),
      ),
    );

    return this.prisma.editProject.update({
      where: { id: edit.id },
      data: {
        name: updateEditDto.name !== undefined ? updateEditDto.name : edit.name,
        state:
          updateEditDto.state !== undefined
            ? updateEditDto.state
            : (edit.state as object),
      },
    });
  }

  private collectStudioMediaUrls(state: unknown): string[] {
    if (
      !state ||
      typeof state !== 'object' ||
      (state as { version?: number }).version !== 3
    ) {
      return [];
    }
    const studio = (
      state as {
        studio?: {
          tracks?: { clips?: { type?: string; fileUrl?: string }[] }[];
        };
      }
    ).studio;
    if (!studio?.tracks) return [];

    const urls = new Set<string>();
    for (const track of studio.tracks) {
      for (const clip of track.clips || []) {
        if (clip.type === 'text' || !clip.fileUrl) continue;
        if (
          clip.fileUrl.startsWith('blob:') ||
          clip.fileUrl.startsWith('data:')
        ) {
          continue;
        }
        urls.add(clip.fileUrl);
      }
    }
    return [...urls];
  }

  // Called once the project's row is gone: its files are kept 30 days,
  // readable by their owner only, then erased (PD-040, TD-008).
  private async deleteProjectMedia(edit: {
    profileId: string;
    mediaUrl: string | null;
    state: unknown;
  }) {
    await this.uploadsService
      .releaseContentFiles([
        edit.mediaUrl,
        ...this.collectStudioMediaUrls(edit.state),
      ])
      .catch((e) => this.logger.warn('Failed to delete studio media', e));
  }

  async remove(profileId: string, id: string) {
    const edit = await this.findOne(profileId, id);

    // The row goes first: a file is deleted only once no row uses it.
    await this.prisma.editProject.delete({
      where: { id: edit.id },
    });
    await this.deleteProjectMedia(edit);

    return { success: true };
  }

  private async assertCaptionsEnabled() {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key: CAPTIONS_FLAG },
    });
    if (flag && !flag.isEnabled) {
      throw AppException.Forbidden(
        ErrorCode.FEATURE_DISABLED,
        'AI captions are temporarily disabled',
      );
    }
  }

  private findClipMediaUrl(state: unknown, clipId: string): string | null {
    if (
      !state ||
      typeof state !== 'object' ||
      (state as { version?: number }).version !== 3
    ) {
      return null;
    }

    const studio = (
      state as {
        studio?: {
          tracks?: { clips?: { id: string; fileUrl?: string }[] }[];
        };
      }
    ).studio;

    if (!studio?.tracks) return null;

    for (const track of studio.tracks) {
      for (const clip of track.clips || []) {
        if (clip.id === clipId && clip.fileUrl) {
          if (
            clip.fileUrl.startsWith('blob:') ||
            clip.fileUrl.startsWith('data:')
          ) {
            return null;
          }
          return clip.fileUrl;
        }
      }
    }
    return null;
  }

  async startCaptions(profileId: string, editId: string, clipId: string) {
    await this.assertCaptionsEnabled();
    if (!this.aiService.isConfigured()) {
      throw new NestHttpException(
        {
          errorCode: ErrorCode.AI_SERVICE_UNAVAILABLE,
          message: 'AI transcription is not configured',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const edit = await this.findOne(profileId, editId);
    const mediaUrl = this.findClipMediaUrl(edit.state, clipId);

    if (!mediaUrl) {
      throw AppException.BadRequest(
        ErrorCode.EDIT_CLIP_NOT_FOUND,
        'Clip not found or media is not uploaded yet',
      );
    }

    const job = await this.aiQueue.add(
      'transcribe-edit-clip',
      { profileId, editId, clipId, mediaUrl },
      { attempts: 2, removeOnComplete: 100, removeOnFail: 50 },
    );

    return { jobId: String(job.id), status: 'queued' };
  }

  async getCaptionsJob(profileId: string, editId: string, jobId: string) {
    await this.findOne(profileId, editId);
    const job = await this.aiQueue.getJob(jobId);
    if (!job) {
      throw AppException.NotFound(
        ErrorCode.NOT_FOUND,
        'Captions job not found',
      );
    }

    const data = job.data as { profileId?: string; editId?: string };
    if (data.profileId !== profileId || data.editId !== editId) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'Not allowed to view this job',
      );
    }

    const state = await job.getState();
    if (state === 'completed') {
      return {
        status: 'completed',
        segments: (job.returnvalue as { segments?: unknown })?.segments || [],
      };
    }
    if (state === 'failed') {
      return {
        status: 'failed',
        error: job.failedReason || 'Transcription failed',
      };
    }
    return { status: state };
  }
}
