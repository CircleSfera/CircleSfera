import { MAX_UPLOAD_BYTES } from '@circlesfera/shared';
import {
  Controller,
  FileTypeValidator,
  Logger,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile as UploadedFileDecorator,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { UploadsService } from './uploads.service.js';

// REST controller for file uploads. Accepts images and videos up to MAX_UPLOAD_MB.
@Controller('uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(private readonly uploadsService: UploadsService) {}

  // Upload a file (image or video, up to MAX_UPLOAD_MB). Returns the public URL and type.
  @Post()
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  // Publishing needs its media.
  @MemberAllowed('content.manage')
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 10,
        parts: 20,
        fieldSize: 1 * 1024 * 1024,
      },
    }),
  )
  @ApiResponse({ status: 201 })
  async uploadFile(
    @UploadedFileDecorator(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES }),
          new FileTypeValidator({
            fileType:
              /(jpg|jpeg|png|gif|webp|heic|heif|mp4|mov|quicktime|webm|mp3|wav|m4a)$/,
          }),
        ],
      }),
    )
    file: UploadedFile,
    @CurrentUser() user?: CurrentUserData,
  ): Promise<{
    url: string;
    standardUrl?: string;
    thumbnailUrl?: string;
    type: string;
  }> {
    this.logger.log(
      `Incoming POST /uploads: ${file.originalname} (${file.mimetype}) by user ${user?.userId ?? 'anonymous'}`,
    );
    return await this.uploadsService.uploadFile(
      file,
      user?.userId,
      user?.profileId,
    );
  }
}
