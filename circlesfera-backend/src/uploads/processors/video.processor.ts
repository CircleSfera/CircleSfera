import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import sharp from 'sharp';
import { assertMediaDurationInRange } from '../../common/constants/media-duration.constants.js';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../common/constants/queue-policy.constants.js';
import {
  ffprobe,
  momentAtPercent,
  runFfmpeg,
  screenshotArgs,
  withTimeout,
} from '../../common/media/ffmpeg-runner.js';
import {
  PROBE_TIME_LIMIT_MS,
  probeMediaDurationSec,
  resolveMediaInputPath,
} from '../../common/utils/media-duration.util.js';
import { safeFetchMedia } from '../../common/utils/safe-media-fetcher.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../interfaces/storage-provider.interface.js';
import { StoredFilesService } from '../services/stored-files.service.js';
import {
  FRAME_ASSEMBLY_JOB,
  type FrameAssemblyJobData,
  type FrameClip,
  UploadsService,
} from '../uploads.service.js';
import { LiveReplayMaker } from './live-replay.maker.js';

/**
 * A video the server makes with a painted layer on it (a story's, a Frame's):
 * 9:16, as on screen.
 */
const VERTICAL_WIDTH = 720;
const VERTICAL_HEIGHT = 1280;
/** The largest painted layer read. */
const LAYER_MAX_BYTES = 20 * 1024 * 1024;
/** The largest painted layer decoded, in pixels. */
const LAYER_MAX_PIXELS = 8192 ** 2;
/** The kinds of image a painted layer is stored as. */
const LAYER_MIME_TYPES = ['image/png', 'image/avif', 'image/webp'];
/** How long joining a story's layer to its video may take. */
const STORY_JOIN_TIME_LIMIT_MS = 300_000;
/** How long putting a Frame together from its clips may take. */
const FRAME_ASSEMBLY_TIME_LIMIT_MS = 600_000;
/** A Frame's frames per second, the same for every clip it is made of. */
const FRAME_FPS = 30;
/** A Frame's sound: one rate and layout for every clip it is made of. */
const FRAME_AUDIO_FORMAT = 'sample_rates=48000:channel_layouts=stereo';
/** The silence a clip with no sound plays in a Frame that has some. */
const FRAME_SILENCE = 'anullsrc=sample_rate=48000:channel_layout=stereo';
/** The largest picture of a clip a Frame is put together from: 4K. */
const FRAME_CLIP_MAX_PIXELS = 3840 * 2160;
const FRAME_ASSEMBLY_TIMED_OUT = 'Putting a Frame together timed out';

const VIDEO_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.VIDEO_TRANSCODING_CONCURRENCY || '2', 10),
);

@Injectable()
@Processor(
  QUEUE_NAMES.VIDEO_TRANSCODING,
  getWorkerOptions(QUEUE_NAMES.VIDEO_TRANSCODING, {
    concurrency: VIDEO_CONCURRENCY,
  }),
)
export class VideoProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider?: StorageProvider,
    @Optional()
    @Inject(UploadsService)
    private readonly uploads?: UploadsService,
    // A file made from another belongs to the same Profile.
    @Optional()
    @Inject(StoredFilesService)
    private readonly storedFiles?: StoredFilesService,
    @Optional()
    @Inject(LiveReplayMaker)
    private readonly liveReplays?: LiveReplayMaker,
  ) {
    super();
  }

  async process(
    job: Job<{
      url: string;
      originalname?: string;
      userId?: string;
      postMediaId?: string;
      storyId?: string;
      streamId?: string;
    }>,
  ): Promise<{ url: string } | undefined> {
    if (job.name === FRAME_ASSEMBLY_JOB) {
      return this.assembleFrame(
        job.data as unknown as Partial<FrameAssemblyJobData> | undefined,
      );
    }
    if (job.name === 'cover') {
      await this.makeCover(job.data?.postMediaId);
      return;
    }
    if (job.name === 'story-overlay') {
      await this.joinStoryOverlay(job.data?.storyId);
      return;
    }
    if (job.name === 'live-replay') {
      await this.makeLiveReplay(job);
      return;
    }
    if (job.name && job.name !== 'transcode' && job.name !== '__default__') {
      throw new UnrecoverableError(
        `Unknown job name in video-transcoding queue: ${job.name}`,
      );
    }

    const { url, userId } = job.data ?? {};
    if (!url) {
      throw new UnrecoverableError('Missing url for video transcoding');
    }

    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          profiles: {
            select: {
              id: true,
              isAccountBanned: true,
              suspendedUntil: true,
            },
          },
        },
      });

      if (
        !user?.isActive ||
        user.isRootBanned ||
        user.profiles.some(
          (p) =>
            p.isAccountBanned ||
            (p.suspendedUntil && p.suspendedUntil > new Date()),
        )
      ) {
        this.logger.warn(
          `Aborting video transcoding job ${job.id} for url ${url}: user ${userId} is inactive, banned, or suspended`,
        );
        return;
      }
    }

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
        throw new UnrecoverableError(
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

        // 3. Extract Thumbnail: 300 px wide, at 10% of the video (with a
        // 5-minute limit; the program is killed when it is reached)
        await withTimeout(
          300_000,
          `Thumbnail extraction timed out after 300s for ${url}`,
          async (signal) => {
            const atSec = momentAtPercent(
              await ffprobe(inputPath, { signal }),
              10,
            );
            await runFfmpeg(screenshotArgs(inputPath, atSec, 300, thumbPath), {
              signal,
            });
          },
        );

        // 4. Transcode to HLS (with a 5-minute limit; the program is killed
        // when it is reached)
        // Simplified: single quality 720p for now
        await withTimeout(
          300_000,
          `HLS transcoding timed out after 300s for ${url}`,
          async (signal) => {
            try {
              await runFfmpeg(
                [
                  '-i',
                  inputPath,
                  '-y',
                  '-profile:v',
                  'main',
                  '-vf',
                  'scale=w=-2:h=720',
                  '-c:a',
                  'aac',
                  '-ar',
                  '48000',
                  '-b:a',
                  '128k',
                  '-c:v',
                  'h264',
                  '-crf',
                  '20',
                  '-g',
                  '48',
                  '-keyint_min',
                  '48',
                  '-sc_threshold',
                  '0',
                  '-b:v',
                  '2500k',
                  '-maxrate',
                  '2675k',
                  '-bufsize',
                  '3750k',
                  '-hls_time',
                  '4',
                  '-hls_playlist_type',
                  'vod',
                  '-hls_segment_filename',
                  path.join(outputDir, '720p_%03d.ts'),
                  masterPlaylistPath,
                ],
                { signal },
              );
            } catch (err) {
              // A run stopped by the time limit is reported as the time out.
              if (!signal.aborted) {
                this.logger.error(`FFMPEG Error: ${(err as Error).message}`);
              }
              throw err;
            }
            this.logger.log(`FFMPEG Transcoding finished for ${url}`);
          },
        );
      }

      // 5. Store HLS artifacts via StorageProvider abstraction
      let m3u8Url = `/uploads/${baseName}/master.m3u8`;
      let thumbUrl = `/uploads/${baseName}/thumb.jpg`;

      if (this.storageProvider?.storeHlsArtifacts) {
        this.logger.debug(
          `Delegating HLS artifact storage for ${baseName} to StorageProvider...`,
        );
        const artifacts = await this.storageProvider.storeHlsArtifacts({
          baseName,
          outputDir,
        });
        m3u8Url = artifacts.masterPlaylistUrl;
        thumbUrl = artifacts.thumbnailUrl;

        // If artifacts were uploaded to a remote provider (e.g. S3 / CDN), clean up local working dir
        if (m3u8Url.startsWith('http://') || m3u8Url.startsWith('https://')) {
          try {
            await fs.promises.rm(outputDir, { recursive: true, force: true });
            createdOutputDir = undefined;
          } catch (cleanupErr) {
            this.logger.warn(
              `Failed to clean up local staging directory for ${baseName}: ${cleanupErr}`,
            );
          }
        }
      }

      // Update PostMedia
      // A frame whose author chose its cover keeps it: only the stream is
      // written there.
      const updatedPosts = await this.prisma.postMedia.updateMany({
        where: { url, coverTimeMs: null },
        data: {
          standardUrl: m3u8Url,
          thumbnailUrl: thumbUrl,
        },
      });
      await this.prisma.postMedia.updateMany({
        where: { url, coverTimeMs: { not: null } },
        data: { standardUrl: m3u8Url },
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

      // Mirror success onto the matching Media row, if one exists (Media
      // rows only exist for backfilled historical content until every
      // upload/read site is migrated onto the relation). A no-op update
      // when there's no match is expected and harmless.
      const withChosenCover = {
        postMedia: { some: { coverTimeMs: { not: null } } },
      };
      await this.prisma.media
        .updateMany({
          where: { url, NOT: withChosenCover },
          data: {
            status: 'READY',
            standardUrl: m3u8Url,
            thumbnailUrl: thumbUrl,
            failedAt: null,
            failureReason: null,
          },
        })
        .then(() =>
          this.prisma.media.updateMany({
            where: { url, ...withChosenCover },
            data: {
              status: 'READY',
              standardUrl: m3u8Url,
              failedAt: null,
              failureReason: null,
            },
          }),
        )
        .catch((err) =>
          this.logger.warn(
            `Failed to sync Media status to READY for ${url}: ${err}`,
          ),
        );

      this.logger.log(
        `Transcoding Complete. Updated models -> Posts: ${updatedPosts.count}, Stories: ${updatedStories.count}, Messages: ${updatedMessages.count}, Comments: ${updatedComments.count}, Avatars: ${updatedAvatars.count}, Covers: ${updatedCovers.count}, Collections: ${updatedCollections.count}`,
      );
    } catch (error) {
      this.logger.error(`Transcoding failed for ${url}: ${error}`);

      // Only mark Media FAILED once BullMQ has exhausted retries — a
      // mid-retry failure isn't a permanent state, so it shouldn't be
      // reported as one. UnrecoverableError always counts as final: BullMQ
      // never retries it regardless of how many attempts remain.
      const totalAttempts = job.opts?.attempts ?? 1;
      const attemptsMade = job.attemptsMade ?? 0;
      const isFinalAttempt =
        error instanceof UnrecoverableError ||
        attemptsMade + 1 >= totalAttempts;
      if (isFinalAttempt) {
        await this.prisma.media
          .updateMany({
            where: { url },
            data: {
              status: 'FAILED',
              failedAt: new Date(),
              failureReason: String(error).slice(0, 500),
            },
          })
          .catch((err) =>
            this.logger.warn(
              `Failed to sync Media status to FAILED for ${url}: ${err}`,
            ),
          );
      }

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

  // The replay of a recorded broadcast. Once every try failed, the
  // recording is marked failed; the recorder's file is kept until the
  // nightly clean-up.
  private async makeLiveReplay(job: Job<{ streamId?: string }>): Promise<void> {
    if (!this.liveReplays) {
      throw new UnrecoverableError('No maker of live replays');
    }
    try {
      await this.liveReplays.make(job.data?.streamId);
    } catch (error) {
      const finalAttempt =
        error instanceof UnrecoverableError ||
        (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1);
      if (finalAttempt) {
        await this.liveReplays
          .markFailed(job.data?.streamId)
          .catch(() => undefined);
      }
      throw error;
    }
  }

  // Makes the cover a frame's author chose: the image of that moment of the
  // frame's own video. The moment is read when the job runs, so of several
  // choices made in a row the last one is the one that stays.
  private async makeCover(postMediaId: string | undefined): Promise<void> {
    if (!postMediaId) {
      throw new UnrecoverableError('Missing media for the cover of a frame');
    }
    if (!this.storageProvider) {
      throw new UnrecoverableError('No storage to keep the cover of a frame');
    }
    const media = await this.prisma.postMedia.findUnique({
      where: { id: postMediaId },
      select: {
        id: true,
        url: true,
        coverTimeMs: true,
        mediaId: true,
        post: { select: { profileId: true } },
      },
    });
    // Deleted meanwhile, or no longer a chosen cover: nothing to make.
    if (!media || media.coverTimeMs === null) return;

    // A moment past the end of the video is taken as its last one.
    const durationSec = await probeMediaDurationSec(media.url);
    const atSec = Math.max(
      0,
      Math.min(media.coverTimeMs / 1000, durationSec - 0.1),
    );

    const workDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'frame-cover-'),
    );
    try {
      await this.screenshot(resolveMediaInputPath(media.url), atSec, workDir);
      const buffer = await fs.promises.readFile(
        path.join(workDir, 'cover.jpg'),
      );
      const stored = await this.storageProvider.upload({
        originalname: `${randomUUID()}.jpg`,
        buffer,
        mimetype: 'image/jpeg',
      });

      // Recorded before it is used, so that a cover in use always has its
      // owner; a cover dropped below keeps a record of a file that is gone.
      try {
        await this.storedFiles?.record([stored.url], {
          profileId: media.post.profileId,
        });
      } catch (error) {
        // Not left on the disk with no owner; the retry makes it again.
        await this.storageProvider.delete(stored.url).catch(() => {});
        throw error;
      }
      // Written only if the author has not chosen another moment meanwhile.
      const written = await this.prisma.postMedia.updateMany({
        where: { id: media.id, coverTimeMs: media.coverTimeMs },
        data: { thumbnailUrl: stored.url },
      });
      if (written.count === 0) {
        await this.storageProvider.delete(stored.url).catch(() => {});
        return;
      }
      if (media.mediaId) {
        await this.prisma.media.updateMany({
          where: { id: media.mediaId },
          data: { thumbnailUrl: stored.url },
        });
      }
      this.logger.log(`Cover made for frame media ${media.id}`);
    } finally {
      await fs.promises
        .rm(workDir, { recursive: true, force: true })
        .catch(() => {});
    }
  }

  // Joins the painted layer of a video story to its video: the video cropped
  // to 9:16 from the centre, as the editor and the viewer show it, with the
  // layer over its whole length and its sound kept. The joined video becomes
  // the story's, and its stream and cover are made as for any upload.
  private async joinStoryOverlay(storyId: string | undefined): Promise<void> {
    if (!storyId) {
      throw new UnrecoverableError('Missing story for its painted layer');
    }
    if (!this.storageProvider || !this.uploads) {
      throw new UnrecoverableError('No storage to keep a joined story');
    }
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: {
        id: true,
        url: true,
        overlayUrl: true,
        mediaId: true,
        profileId: true,
      },
    });
    // Deleted meanwhile, or already joined: nothing to do.
    if (!story?.overlayUrl) return;
    if (
      !this.uploads.ownsUrl(story.url) ||
      !this.uploads.ownsUrl(story.overlayUrl)
    ) {
      throw new UnrecoverableError(
        `The video or the layer of story ${story.id} is not of this storage`,
      );
    }

    const workDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'story-overlay-'),
    );
    try {
      const layerPath = await this.readLayer(story.overlayUrl, workDir);

      const joinedPath = path.join(workDir, 'story.mp4');
      await this.joinLayer(
        resolveMediaInputPath(story.url),
        layerPath,
        joinedPath,
      );
      const stored = await this.storageProvider.upload({
        originalname: `${randomUUID()}.mp4`,
        buffer: await fs.promises.readFile(joinedPath),
        mimetype: 'video/mp4',
      });

      // Written only if the story still waits for this very layer, the story
      // and its Media row together or neither.
      const written = await this.prisma
        .$transaction(async (tx) => {
          const changed = await tx.story.updateMany({
            where: {
              id: story.id,
              url: story.url,
              overlayUrl: story.overlayUrl,
            },
            data: {
              url: stored.url,
              overlayUrl: null,
              standardUrl: null,
              thumbnailUrl: null,
            },
          });
          if (changed.count > 0 && story.mediaId) {
            await tx.media.updateMany({
              where: { id: story.mediaId },
              data: { url: stored.url, standardUrl: null, thumbnailUrl: null },
            });
          }
          if (changed.count > 0) {
            await this.storedFiles?.record(
              [stored.url],
              { profileId: story.profileId },
              tx,
            );
          }
          return changed.count;
        })
        .catch(async (error: unknown) => {
          // Nothing was written: the joined video is not kept for a retry.
          await this.storageProvider?.delete(stored.url).catch(() => {});
          throw error;
        });
      if (written === 0) {
        await this.storageProvider.delete(stored.url).catch(() => {});
        return;
      }
      // Should this fail, the five-minute recovery asks for the stream again.
      await this.uploads.enqueueTranscode(stored.url);
      // The story no longer names them: the originals go if they are the
      // story's own and nothing else uses them.
      await this.uploads
        .deleteContentFiles(story.profileId, [story.overlayUrl, story.url])
        .catch(() => {});
      this.logger.log(`Painted layer joined to the video of story ${story.id}`);
    } finally {
      await fs.promises
        .rm(workDir, { recursive: true, force: true })
        .catch(() => {});
    }
  }

  // Puts a Frame together from its clips: each one trimmed to its part and
  // cropped to 9:16 from the centre, played one after the other, with the
  // painted layer over the whole length. The sound is kept unless the author
  // muted it or no clip has any; a clip with none plays silence. The video is stored as the
  // Profile's own and its stream is asked for; the clips and the layer are
  // left as they are, as the author may go back to the editor. Answers the
  // address of the video.
  private async assembleFrame(
    data: Partial<FrameAssemblyJobData> | undefined,
  ): Promise<{ url: string }> {
    const { profileId, clips, layerUrl, muted } = data ?? {};
    if (!profileId || !clips?.length) {
      throw new UnrecoverableError('Missing the clips of a Frame');
    }
    if (!this.storageProvider || !this.uploads) {
      throw new UnrecoverableError('No storage to keep a Frame');
    }
    const { storageProvider, uploads } = this;
    const files = [
      ...clips.map((clip) => clip.url),
      ...(layerUrl ? [layerUrl] : []),
    ];
    if (!files.every((url) => uploads.ownsUrl(url))) {
      throw new UnrecoverableError(
        'A clip or the layer of a Frame is not of this storage',
      );
    }

    const workDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'frame-assembly-'),
    );
    try {
      const inputs = clips.map((clip) => resolveMediaInputPath(clip.url));
      const probes = await Promise.all(
        inputs.map((input) =>
          withTimeout(
            PROBE_TIME_LIMIT_MS,
            'Reading a clip of a Frame timed out',
            (signal) => ffprobe(input, { signal }),
          ),
        ),
      );
      // A part past the end of its clip lasts only to that end. A clip that
      // is not a video of a length that can be read, or whose picture is
      // past 4K, is refused, and so is the Frame when what is left is not as
      // long as a Frame may be.
      const parts = clips.map((clip, index) => {
        const probe = probes[index];
        const streams = probe.streams ?? [];
        const picture = streams.find((stream) => stream.codec_type === 'video');
        const clipMs = Math.floor(Number(probe.format?.duration) * 1000);
        if (!picture || !Number.isFinite(clipMs) || clipMs <= 0) {
          throw new UnrecoverableError('FRAME_CLIP_UNREADABLE');
        }
        if (
          (picture.width ?? 0) * (picture.height ?? 0) >
          FRAME_CLIP_MAX_PIXELS
        ) {
          throw new UnrecoverableError('FRAME_CLIP_TOO_LARGE');
        }
        return {
          clip: { ...clip, endMs: Math.min(clip.endMs, clipMs) },
          sound: streams.some((stream) => stream.codec_type === 'audio'),
        };
      });
      const lengthMs = parts.reduce(
        (sum, { clip }) => sum + Math.max(0, clip.endMs - clip.startMs),
        0,
      );
      const window = assertMediaDurationInRange('FRAME', lengthMs / 1000);
      if (!window.ok) {
        throw new UnrecoverableError(window.code);
      }
      // A part that starts past the end of its clip has nothing to play.
      if (parts.some(({ clip }) => clip.endMs <= clip.startMs)) {
        throw new UnrecoverableError('FRAME_CLIP_RANGE_INVALID');
      }
      const sound =
        muted !== true && parts.some((part) => part.sound)
          ? parts.map((part) => part.sound)
          : null;

      const layerPath = layerUrl
        ? await this.readLayer(layerUrl, workDir)
        : undefined;
      const output = path.join(workDir, 'frame.mp4');
      // A Frame that took too long once takes as long again: not retried.
      await withTimeout(
        FRAME_ASSEMBLY_TIME_LIMIT_MS,
        FRAME_ASSEMBLY_TIMED_OUT,
        (signal) =>
          runFfmpeg(
            frameAssemblyArgs(
              parts.map((part) => part.clip),
              inputs,
              layerPath,
              sound,
              output,
            ),
            { signal },
          ),
      ).catch((error: unknown) => {
        throw error instanceof Error &&
          error.message === FRAME_ASSEMBLY_TIMED_OUT
          ? new UnrecoverableError(FRAME_ASSEMBLY_TIMED_OUT)
          : error;
      });
      const stored = await storageProvider.upload({
        originalname: `${randomUUID()}.mp4`,
        buffer: await fs.promises.readFile(output),
        mimetype: 'video/mp4',
      });
      try {
        await this.storedFiles?.record([stored.url], { profileId });
      } catch (error) {
        // Not left on the disk with no owner; the retry makes it again.
        await storageProvider.delete(stored.url).catch(() => {});
        throw error;
      }
      // Should this fail, the retry makes the Frame again.
      await uploads.enqueueTranscode(stored.url);
      this.logger.log(`Frame put together from ${clips.length} clips`);
      return { url: stored.url };
    } finally {
      await fs.promises
        .rm(workDir, { recursive: true, force: true })
        .catch(() => {});
    }
  }

  // Reads a stored painted layer as a PNG of the vertical video's size, in
  // the work folder. Read here, not by FFmpeg: a stored layer may be AVIF,
  // whose transparency FFmpeg does not always keep.
  private async readLayer(url: string, workDir: string): Promise<string> {
    const layer = await safeFetchMedia(url, {
      maxBytes: LAYER_MAX_BYTES,
      allowedMimeTypes: LAYER_MIME_TYPES,
    });
    const layerPath = path.join(workDir, 'layer.png');
    await sharp(layer.buffer, { limitInputPixels: LAYER_MAX_PIXELS })
      .resize(VERTICAL_WIDTH, VERTICAL_HEIGHT, { fit: 'fill' })
      .png()
      .toFile(layerPath);
    return layerPath;
  }

  // The video cropped to the story's frame with the layer over it, as MP4.
  // The layer is an image repeated (-loop 1) for the whole of the video.
  private joinLayer(
    video: string,
    layer: string,
    output: string,
  ): Promise<void> {
    return withTimeout(
      STORY_JOIN_TIME_LIMIT_MS,
      'Joining the layer of a story timed out',
      (signal) =>
        runFfmpeg(
          [
            '-i',
            video,
            '-loop',
            '1',
            '-i',
            layer,
            '-y',
            '-filter_complex',
            [
              `[0:v]scale=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT}:force_original_aspect_ratio=increase,crop=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT},setsar=1[video]`,
              '[video][1:v]overlay=0:0:shortest=1:format=auto[out]',
            ].join(';'),
            '-map',
            '[out]',
            '-map',
            '0:a?',
            '-c:v',
            'h264',
            '-preset',
            'veryfast',
            '-crf',
            '23',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-movflags',
            '+faststart',
            output,
          ],
          { signal },
        ),
    );
  }

  // One image of a video at a moment, 540 px wide, written as cover.jpg in a
  // folder.
  private screenshot(
    input: string,
    atSec: number,
    folder: string,
  ): Promise<void> {
    return withTimeout(
      120_000,
      'Making the cover of a frame timed out',
      (signal) =>
        runFfmpeg(
          screenshotArgs(input, atSec, 540, path.join(folder, 'cover.jpg')),
          { signal },
        ),
    );
  }
}

/** A moment of a clip, given in ms, as FFmpeg reads it: in seconds. */
function seconds(ms: number): string {
  return String(ms / 1000);
}

/**
 * The arguments of the one FFmpeg run that puts a Frame together: each clip
 * trimmed to its part with its time starting again at zero, at one frame
 * rate, cropped to 9:16 from the centre; the clips joined in their order;
 * the layer, an image repeated (-loop 1), over the whole length. `sound`
 * says which clips have sound; one with none plays silence as long as its
 * part. With no sound (null), the video has no sound track at all.
 */
export function frameAssemblyArgs(
  clips: readonly FrameClip[],
  inputs: readonly string[],
  layer: string | undefined,
  sound: readonly boolean[] | null,
  output: string,
): string[] {
  const withSound = sound !== null;
  const filters: string[] = [];
  const joined: string[] = [];
  clips.forEach((clip, index) => {
    const part = `start=${seconds(clip.startMs)}:end=${seconds(clip.endMs)}`;
    filters.push(
      `[${index}:v]trim=${part},setpts=PTS-STARTPTS,fps=${FRAME_FPS},scale=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT}:force_original_aspect_ratio=increase,crop=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT},setsar=1[v${index}]`,
    );
    joined.push(`[v${index}]`);
    if (sound) {
      filters.push(
        sound[index]
          ? `[${index}:a]atrim=${part},asetpts=PTS-STARTPTS,aformat=${FRAME_AUDIO_FORMAT}[a${index}]`
          : `${FRAME_SILENCE},atrim=end=${seconds(clip.endMs - clip.startMs)},aformat=${FRAME_AUDIO_FORMAT}[a${index}]`,
      );
      joined.push(`[a${index}]`);
    }
  });
  const video = layer ? '[joined]' : '[out]';
  filters.push(
    `${joined.join('')}concat=n=${clips.length}:v=1:a=${withSound ? 1 : 0}${video}${withSound ? '[sound]' : ''}`,
  );
  if (layer) {
    filters.push(
      `[joined][${clips.length}:v]overlay=0:0:shortest=1:format=auto[out]`,
    );
  }
  return [
    ...inputs.flatMap((input) => ['-i', input]),
    ...(layer ? ['-loop', '1', '-i', layer] : []),
    '-y',
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[out]',
    ...(withSound
      ? ['-map', '[sound]', '-c:a', 'aac', '-b:a', '128k']
      : ['-an']),
    '-c:v',
    'h264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    output,
  ];
}
