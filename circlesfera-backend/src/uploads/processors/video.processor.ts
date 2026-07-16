import * as fs from 'node:fs';
import * as path from 'node:path';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import { PrismaService } from '../../prisma/prisma.service.js';

@Processor('video-transcoding')
export class VideoProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ url: string }>): Promise<void> {
    const { url } = job.data;
    this.logger.log(`Starting HLS transcoding for: ${url}`);

    try {
      // 1. Resolve input file
      let inputPath = '';
      if (url.startsWith('/uploads/')) {
        inputPath = path.join(process.cwd(), url);
      } else {
        // If it's a full HTTP URL (e.g., S3), ffmpeg can read it directly!
        inputPath = url;
      }

      // 2. Prepare output directory
      const baseName = path.basename(url, path.extname(url));
      const outputDir = path.join(process.cwd(), 'uploads', baseName);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const masterPlaylistPath = path.join(outputDir, 'master.m3u8');

      // 3. Extract Thumbnail
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .screenshots({
            timestamps: ['10%'], // take screenshot at 10% of video
            filename: 'thumb.jpg',
            folder: outputDir,
            size: '300x?',
          })
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err));
      });

      // 4. Transcode to HLS (Simplified: single quality 720p for now to save time)
      // In a real prod scenario we'd do multiple qualities (1080p, 720p, 480p)
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-profile:v main',
            '-vf scale=w=-2:h=720',
            '-c:a aac',
            '-ar 48000',
            '-b:a 128k',
            '-c:v h264',
            '-crf 20',
            '-g 48',
            '-keyint_min 48',
            '-sc_threshold 0',
            '-b:v 2500k',
            '-maxrate 2675k',
            '-bufsize 3750k',
            '-hls_time 4',
            '-hls_playlist_type vod',
            '-hls_segment_filename',
            path.join(outputDir, '720p_%03d.ts'),
          ])
          .output(masterPlaylistPath)
          .on('end', () => {
            this.logger.log(`FFMPEG Transcoding finished for ${url}`);
            resolve();
          })
          .on('error', (err: Error) => {
            this.logger.error(`FFMPEG Error: ${err.message}`);
            reject(err);
          })
          .run();
      });

      // 5. Update Database entries with new URLs
      const m3u8Url = `/uploads/${baseName}/master.m3u8`;
      const thumbUrl = `/uploads/${baseName}/thumb.jpg`;

      // Update PostMedia
      const updatedPosts = await this.prisma.postMedia.updateMany({
        where: { url },
        data: {
          standardUrl: m3u8Url,
          thumbnailUrl: thumbUrl,
        },
      });

      // Update Story
      const updatedStories = await this.prisma.story.updateMany({
        where: { url },
        data: {
          standardUrl: m3u8Url,
          thumbnailUrl: thumbUrl,
        },
      });

      // Update Message
      const updatedMessages = await this.prisma.message.updateMany({
        where: { url },
        data: {
          standardUrl: m3u8Url,
          thumbnailUrl: thumbUrl,
        },
      });

      // Update Comment
      const updatedComments = await this.prisma.comment.updateMany({
        where: { url },
        data: {
          standardUrl: m3u8Url,
          thumbnailUrl: thumbUrl,
        },
      });

      // Update Profile Avatar
      const updatedAvatars = await this.prisma.profile.updateMany({
        where: { avatar: url },
        data: {
          standardUrl: m3u8Url,
          thumbnailUrl: thumbUrl,
        },
      });

      // Update Profile Cover
      const updatedCovers = await this.prisma.profile.updateMany({
        where: { cover: url },
        data: {
          coverStandardUrl: m3u8Url,
          coverThumbnailUrl: thumbUrl,
        },
      });

      // Update Collection Cover
      const updatedCollections = await this.prisma.collection.updateMany({
        where: { coverUrl: url },
        data: {
          standardUrl: m3u8Url,
          thumbnailUrl: thumbUrl,
        },
      });

      this.logger.log(
        `Transcoding Complete. Updated models -> Posts: ${updatedPosts.count}, Stories: ${updatedStories.count}, Messages: ${updatedMessages.count}, Comments: ${updatedComments.count}, Avatars: ${updatedAvatars.count}, Covers: ${updatedCovers.count}, Collections: ${updatedCollections.count}`,
      );
    } catch (error) {
      this.logger.error(`Transcoding failed for ${url}: ${error}`);
      throw error;
    }
  }
}
