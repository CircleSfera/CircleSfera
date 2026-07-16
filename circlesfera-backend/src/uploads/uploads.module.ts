import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface.js';
import { MediaProcessorService } from './media-processor.service.js';
import { VideoProcessor } from './processors/video.processor.js';
import { CloudinaryProvider } from './providers/cloudinary.provider.js';
import { LocalStorageProvider } from './providers/local.provider.js';
import { S3Provider } from './providers/s3.provider.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'video-transcoding',
    }),
  ],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    MediaProcessorService,
    VideoProcessor,
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
  exports: [UploadsService],
})
export class UploadsModule {}
