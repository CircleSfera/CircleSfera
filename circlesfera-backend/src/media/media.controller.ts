import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('teaser/:mediaId/*file')
  async serveTeaser(
    @Param('mediaId') mediaId: string,
    @Param('file') file: string | string[],
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const media = await this.prisma.postMedia.findUnique({
      where: { id: mediaId },
    });

    if (!media?.standardUrl) {
      this.logger.warn(
        `Teaser requested for missing media: ${mediaId} by ${req.ip}`,
      );
      throw new NotFoundException('Media not found');
    }

    // Determine the base upload directory from standardUrl (e.g., "/uploads/video_123/master.m3u8")
    const match = media.standardUrl.match(/^\/uploads\/(.+)\/[^/]+$/);
    if (!match) {
      this.logger.error(
        `Invalid media path format for media ${mediaId}: ${media.standardUrl}`,
      );
      throw new NotFoundException('Invalid media path');
    }

    const baseFolder = match[1];
    const relativeFile = Array.isArray(file) ? path.join(...file) : file;
    const uploadsRoot = path.resolve(process.cwd(), 'uploads', baseFolder);
    const absolutePath = path.resolve(uploadsRoot, relativeFile);

    // Prevent path traversal outside the media folder
    if (
      absolutePath !== uploadsRoot &&
      !absolutePath.startsWith(uploadsRoot + path.sep)
    ) {
      this.logger.warn(
        `Path traversal blocked for media ${mediaId}: ${relativeFile}`,
      );
      throw new ForbiddenException('Invalid file path');
    }

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('File not found');
    }

    // If it's a playlist (.m3u8), we slice it to keep only the first 5 seconds (usually ~2 segments)
    if (relativeFile.endsWith('.m3u8')) {
      const content = fs.readFileSync(absolutePath, 'utf8');
      const lines = content.split('\n');

      const processedLines: string[] = [];
      let segmentCount = 0;
      const MAX_SEGMENTS = 2; // Roughly 4-5 seconds depending on HLS segment target duration

      for (const line of lines) {
        if (line.startsWith('#EXTINF:')) {
          if (segmentCount >= MAX_SEGMENTS) break;
          segmentCount++;
        }
        processedLines.push(line);
      }

      // Add ENDLIST if we cut it early
      if (
        segmentCount >= MAX_SEGMENTS &&
        !processedLines.includes('#EXT-X-ENDLIST')
      ) {
        processedLines.push('#EXT-X-ENDLIST');
      }

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(processedLines.join('\n'));
    }

    // If it's a TS segment, only allow the first few segments (e.g., stream_0.ts, stream_1.ts)
    if (relativeFile.endsWith('.ts')) {
      const segmentMatch = relativeFile.match(/_(\d+)\.ts$/);
      if (segmentMatch) {
        const segmentIndex = parseInt(segmentMatch[1], 10);
        if (segmentIndex >= 2) {
          throw new ForbiddenException('Premium content locked');
        }
      }

      res.setHeader('Content-Type', 'video/MP2T');
      return res.sendFile(absolutePath);
    }

    // Other files (like thumb.jpg)
    return res.sendFile(absolutePath);
  }
}
