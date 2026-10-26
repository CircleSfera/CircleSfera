import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface.js';
import { MediaProcessorService } from './media-processor.service.js';
import { MediaSignatureValidator } from './media-signature.validator.js';
import { MediaCleanupProcessor } from './processors/media-cleanup.processor.js';
import { VideoProcessor } from './processors/video.processor.js';
import { CloudinaryProvider } from './providers/cloudinary.provider.js';
import { LocalStorageProvider } from './providers/local.provider.js';
import { S3Provider } from './providers/s3.provider.js';
import { DetachedFilesErasureService } from './services/detached-files-erasure.service.js';
import { MediaReconciliationService } from './services/media-reconciliation.service.js';
import { MediaReferencesService } from './services/media-references.service.js';
import { StoredFilesService } from './services/stored-files.service.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';
import { VoiceNoteConverter } from './voice-note.converter.js';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.VIDEO_TRANSCODING),
      getRegisterQueueOptions(QUEUE_NAMES.MEDIA_CLEANUP),
    ),
  ],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    MediaProcessorService,
    MediaSignatureValidator,
    VoiceNoteConverter,
    VideoProcessor,
    MediaCleanupProcessor,
    DetachedFilesErasureService,
    MediaReconciliationService,
    MediaReferencesService,
    StoredFilesService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const hasS3Config = configService.get<string>('AWS_S3_BUCKET');
        if (hasS3Config) {
          return new S3Provider(configService);
        }

        const isCloudinaryConfigured =
          configService.get<string>('CLOUDINARY_NAME');

        return isCloudinaryConfigured
          ? new CloudinaryProvider(configService)
          : new LocalStorageProvider();
      },
    },
  ],
  exports: [
    UploadsService,
    MediaReconciliationService,
    StoredFilesService,
    STORAGE_PROVIDER,
  ],
})
export class UploadsModule {}
