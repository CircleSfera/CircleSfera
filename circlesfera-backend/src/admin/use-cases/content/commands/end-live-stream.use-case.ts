import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class EndLiveStreamUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  async execute(adminId: string, streamId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
    });
    if (!stream) throw new NotFoundException('Live stream not found');
    if (stream.status === 'ENDED') {
      return stream;
    }

    const updated = await this.prisma.liveStream.update({
      where: { id: streamId },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
        replayUrl:
          stream.hlsUrl ||
          `https://cdn.circlesfera.com/vod/replays/${stream.id}.m3u8`,
      },
    });

    await this.logAdminAction.execute(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'live_stream',
      streamId,
      'Admin force-ended live stream',
    );

    return updated;
  }
}
