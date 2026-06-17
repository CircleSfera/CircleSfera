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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { UploadsService } from './uploads.service.js';

/** REST controller for file uploads. Accepts images and videos up to 10 MB. */
@Controller('uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(private readonly uploadsService: UploadsService) {}

  /** Upload a file (image or video, max 10 MB). Returns the public URL and type. */
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit at Multer level
    }),
  )
  async uploadFile(
    @UploadedFileDecorator(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 500 * 1024 * 1024 }), // 500MB
          new FileTypeValidator({
            fileType:
              /(jpg|jpeg|png|gif|webp|heic|heif|mp4|mov|quicktime|webm|mp3|wav|m4a)$/,
          }),
        ],
      }),
    )
    file: UploadedFile,
  ): Promise<{
    url: string;
    standardUrl?: string;
    thumbnailUrl?: string;
    type: string;
  }> {
    this.logger.log(
      `Incoming POST /uploads: ${file.originalname} (${file.mimetype})`,
    );
    return await this.uploadsService.uploadFile(file);
  }
}
