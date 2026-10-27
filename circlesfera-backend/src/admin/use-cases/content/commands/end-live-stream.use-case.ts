import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { LiveRecordingService } from '../../../../live/recording/live-recording.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class EndLiveStreamUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
    @Inject(LiveRecordingService)
    private readonly recording: LiveRecordingService,
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
      // Its recording is kept for staff to review and never offered to the
      // host. No replay address is set here: there is no file behind one
      // until the recording is made into its replay.
      data: { status: 'ENDED', endedAt: new Date(), endedByStaff: true },
    });
    await this.recording.stop(streamId);

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
