import * as fs from 'node:fs';
import * as path from 'node:path';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import { PrismaService } from '../../prisma/prisma.service.js';

const VIDEO_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.VIDEO_TRANSCODING_CONCURRENCY || '2', 10),
);

@Processor('video-transcoding', { concurrency: VIDEO_CONCURRENCY })
export class VideoProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(
    job: Job<{ url: string; originalname?: string; userId?: string }>,
  ): Promise<void> {
    const { url, userId } = job.data;
    this.logger.log(
      `Starting HLS transcoding for: ${url} (job ${job.id}, user: ${userId ?? 'system'})`,
    );

    let createdOutputDir: string | undefined;
    try {
      // 1. Resolve input file
      let inputPath = '';
      if (url.startsWith('/uploads/')) {
        inputPath = path.join(process.cwd(), url);
      } else {
        // If it's a full HTTP URL (e.g., S3), ffmpeg can read it directly!
        inputPath = url;
      }

      // 2. Prepare output directory.
      // baseName MUST be a UUID v4 — enforced by the storage providers that
      // generate artifact names via randomUUID(). Reject any job that violates
      // this invariant to prevent path manipulation.
      const baseName = path.basename(url, path.extname(url));
      const UUID_REGEX =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!UUID_REGEX.test(baseName)) {
        throw new Error(
          `Refusing HLS transcoding: baseName "${baseName}" is not a valid UUID v4. ` +
            `Only opaque artifact IDs are permitted as output directory names.`,
        );
      }
      const outputDir = path.join(process.cwd(), 'uploads', baseName);
      createdOutputDir = outputDir;

      const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
      const thumbPath = path.join(outputDir, 'thumb.jpg');

      // Check if transcoding was already completed (idempotence)
      const isAlreadyTranscoded =
        fs.existsSync(masterPlaylistPath) &&
        fs.existsSync(thumbPath) &&
        (() => {
          try {
            return (
              fs.statSync(masterPlaylistPath).size > 0 &&
              fs.statSync(thumbPath).size > 0
            );
          } catch {
            return false;
          }
        })();

      if (isAlreadyTranscoded) {
        this.logger.log(
          `Video artifacts already completely transcoded for ${url} at ${outputDir}. Skipping FFmpeg execution.`,
        );
      } else {
        // If directory exists with partial/dirty state from a previous aborted crash, purge it cleanly
        if (fs.existsSync(outputDir)) {
          fs.rmSync(outputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(outputDir, { recursive: true });

        // 3. Extract Thumbnail (with 5-minute timeout and explicit process termination guard)
        await new Promise<void>((resolve, reject) => {
          let finished = false;
          const ffmpegCmd = ffmpeg(inputPath, { timeout: 300 });

          const timer = setTimeout(() => {
            if (!finished) {
              finished = true;
              try {
                ffmpegCmd.kill('SIGKILL');
              } catch {
                // Ignore kill errors if already exited
              }
              reject(
                new Error(
                  `Thumbnail extraction timed out after 300s for ${url}`,
                ),
              );
            }
          }, 300_000);

          ffmpegCmd
            .screenshots({
              timestamps: ['10%'], // Take screenshot at 10% of video
              filename: 'thumb.jpg',
              folder: outputDir,
              size: '300x?',
            })
            .on('end', () => {
              if (!finished) {
                finished = true;
                clearTimeout(timer);
                resolve();
              }
            })
            .on('error', (err: Error) => {
              if (!finished) {
                finished = true;
                clearTimeout(timer);
                reject(err);
              }
            });
        });

        // 4. Transcode to HLS (with 5-minute timeout and explicit process termination guard)
        // Simplified: single quality 720p for now
        await new Promise<void>((resolve, reject) => {
          let finished = false;
          const ffmpegCmd = ffmpeg(inputPath, { timeout: 300 });

          const timer = setTimeout(() => {
            if (!finished) {
              finished = true;
              try {
                ffmpegCmd.kill('SIGKILL');
              } catch {
                // Ignore kill errors if already exited
              }
              reject(
                new Error(`HLS transcoding timed out after 300s for ${url}`),
              );
            }
          }, 300_000);

          ffmpegCmd
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
              if (!finished) {
                finished = true;
                clearTimeout(timer);
                this.logger.log(`FFMPEG Transcoding finished for ${url}`);
                resolve();
              }
            })
            .on('error', (err: Error) => {
              if (!finished) {
                finished = true;
                clearTimeout(timer);
                this.logger.error(`FFMPEG Error: ${err.message}`);
                reject(err);
              }
            })
            .run();
        });
      }

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
      if (createdOutputDir && fs.existsSync(createdOutputDir)) {
        try {
          fs.rmSync(createdOutputDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          this.logger.warn(
            `Failed to clean up output directory ${createdOutputDir}: ${cleanupErr}`,
          );
        }
      }
      throw error;
    }
  }
}
