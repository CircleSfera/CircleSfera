import { FRAME_CLIPS_MAX, MAX_UPLOAD_BYTES } from '@circlesfera/shared';
import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
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
import { AssembleFrameDto } from './dto/assemble-frame.dto.js';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { type FrameAssemblyStatus, UploadsService } from './uploads.service.js';

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

  // Keeps a clip recorded for a Frame, to be put together with the others.
  // A video only, stored as it is: its stream is made of the Frame, not of
  // the clip, so it takes no place in the video queue, and as many as a
  // Frame holds can be sent in a minute.
  @Post('frames/clips')
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  @MemberAllowed('content.manage')
  @Throttle({ short: { limit: FRAME_CLIPS_MAX, ttl: 60000 } })
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
  uploadFrameClip(
    @UploadedFileDecorator(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES }),
          new FileTypeValidator({ fileType: /(mp4|mov|quicktime|webm)$/ }),
        ],
      }),
    )
    file: UploadedFile,
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ url: string; type: string }> {
    return this.uploadsService.uploadFile(file, user.userId, user.profileId, {
      frameClip: true,
    });
  }

  // Puts a Frame together from its recorded clips, trimmed and in order, with
  // its painted layer over them. Answers the id to ask after; the video is
  // made in the background.
  @Post('frames')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  // Publishing needs its media.
  @MemberAllowed('content.manage')
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @ApiResponse({ status: 202 })
  assembleFrame(
    @Body() dto: AssembleFrameDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<{ id: string }> {
    return this.uploadsService.startFrameAssembly(
      { profileId: user.profileId, userId: user.userId },
      dto,
    );
  }

  // Where a Frame being put together is: pending, ready with its video, or
  // failed. Only the Profile that asked for it can see it.
  @Get('frames/:id')
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  @MemberAllowed('content.manage')
  @ApiResponse({ status: 200 })
  frameAssemblyStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<FrameAssemblyStatus> {
    return this.uploadsService.frameAssemblyStatus(user.profileId, id);
  }
}
