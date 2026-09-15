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
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { UploadsService } from './uploads.service.js';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// REST controller for file uploads. Accepts images and videos up to 100 MB.
@Controller('uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(private readonly uploadsService: UploadsService) {}

  // Upload a file (image or video, max 100 MB). Returns the public URL and type.
  @Post()
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
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
    return await this.uploadsService.uploadFile(file, user?.userId);
  }
}
