import { Test, type TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentAdminData } from '../auth/decorators/current-admin.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminContentController } from './admin-content.controller.js';
import { DeleteCommentUseCase } from './use-cases/content/commands/delete-comment.use-case.js';
import { DeletePostUseCase } from './use-cases/content/commands/delete-post.use-case.js';
import { DeleteStoryUseCase } from './use-cases/content/commands/delete-story.use-case.js';
import { EndLiveStreamUseCase } from './use-cases/content/commands/end-live-stream.use-case.js';
import { ModerateContentUseCase } from './use-cases/content/commands/moderate-content.use-case.js';
import { ReviewPromotionUseCase } from './use-cases/content/commands/review-promotion.use-case.js';
import { ReviewReportUseCase } from './use-cases/content/commands/review-report.use-case.js';
import { GetContentQuery } from './use-cases/content/queries/get-content.query.js';
import { GetLiveStreamsQuery } from './use-cases/content/queries/get-live-streams.query.js';
import { GetModerationQueueQuery } from './use-cases/content/queries/get-moderation-queue.query.js';
import { GetPostsQuery } from './use-cases/content/queries/get-posts.query.js';
import { GetPromotionsQuery } from './use-cases/content/queries/get-promotions.query.js';
import { GetReportsQuery } from './use-cases/content/queries/get-reports.query.js';

describe('AdminContentController', () => {
  let controller: AdminContentController;

  const admin: CurrentAdminData = {
    adminId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Staff',
    permissions: ['content', 'reports', 'moderation', 'live'],
    roles: ['ADMIN'],
    userId: 'admin-1',
  };

  const getPosts = { execute: vi.fn() };
  const deletePost = { execute: vi.fn() };
  const getReports = { execute: vi.fn() };
  const reviewReport = {
    updateStatus: vi.fn(),
    claim: vi.fn(),
    unclaim: vi.fn(),
    reassign: vi.fn(),
    resolveWithPenalty: vi.fn(),
    bulkUpdate: vi.fn(),
  };
  const getContent = {
    exportPostsCSV: vi.fn(),
    getHashtags: vi.fn(),
    getComments: vi.fn(),
    getStories: vi.fn(),
    getTrustQueue: vi.fn(),
  };
  const deleteComment = { execute: vi.fn() };
  const deleteStory = { execute: vi.fn() };
  const getPromotions = { execute: vi.fn() };
  const reviewPromotion = { execute: vi.fn() };
  const getModerationQueue = { execute: vi.fn() };
  const moderateContent = { execute: vi.fn() };
  const getLiveStreams = { execute: vi.fn() };
  const endLiveStream = { execute: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminContentController],
      providers: [
        { provide: GetPostsQuery, useValue: getPosts },
        { provide: DeletePostUseCase, useValue: deletePost },
        { provide: GetReportsQuery, useValue: getReports },
        { provide: ReviewReportUseCase, useValue: reviewReport },
        { provide: GetContentQuery, useValue: getContent },
        { provide: DeleteCommentUseCase, useValue: deleteComment },
        { provide: DeleteStoryUseCase, useValue: deleteStory },
        { provide: GetPromotionsQuery, useValue: getPromotions },
        { provide: ReviewPromotionUseCase, useValue: reviewPromotion },
        { provide: GetModerationQueueQuery, useValue: getModerationQueue },
        { provide: ModerateContentUseCase, useValue: moderateContent },
        { provide: GetLiveStreamsQuery, useValue: getLiveStreams },
        { provide: EndLiveStreamUseCase, useValue: endLiveStream },
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminContentController>(AdminContentController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists posts with default pagination and no actor', async () => {
    getPosts.execute.mockResolvedValue({ data: [] });

    await controller.getPosts({});
    await controller.getPosts({
      page: 2,
      limit: 20,
      search: 'q',
      type: 'FRAME',
      userId: 'user-2',
      moderationStatus: 'HIDDEN',
    });

    expect(getPosts.execute).toHaveBeenNthCalledWith(
      1,
      1,
      10,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(getPosts.execute).toHaveBeenNthCalledWith(
      2,
      2,
      20,
      'q',
      'FRAME',
      'user-2',
      'HIDDEN',
    );
  });

  it('exports posts CSV without an actor', async () => {
    const res = {
      setHeader: vi.fn(),
      send: vi.fn(),
    } as unknown as Response;
    getContent.exportPostsCSV.mockResolvedValue('id,caption\n');

    await controller.exportPostsCSV(res);

    expect(getContent.exportPostsCSV).toHaveBeenCalledWith();
    expect(res.send).toHaveBeenCalledWith('id,caption\n');
  });

  it('deletes post, comment and story as adminId', async () => {
    deletePost.execute.mockResolvedValue({ ok: true });
    deleteComment.execute.mockResolvedValue({ ok: true });
    deleteStory.execute.mockResolvedValue({ ok: true });

    await controller.deletePost('post-1', admin);
    await controller.deleteComment('c-1', admin);
    await controller.deleteStory('story-1', admin);

    expect(deletePost.execute).toHaveBeenCalledWith('admin-1', 'post-1');
    expect(deleteComment.execute).toHaveBeenCalledWith('admin-1', 'c-1');
    expect(deleteStory.execute).toHaveBeenCalledWith('admin-1', 'story-1');
  });

  it('lists reports with default pagination', async () => {
    getReports.execute.mockResolvedValue({ data: [] });

    await controller.getReports({});

    expect(getReports.execute).toHaveBeenCalledWith(
      1,
      10,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  it('reviews reports as adminId and unwraps bodies', async () => {
    reviewReport.updateStatus.mockResolvedValue({ id: 'r-1' });
    reviewReport.claim.mockResolvedValue({ id: 'r-1' });
    reviewReport.unclaim.mockResolvedValue({ id: 'r-1' });
    reviewReport.reassign.mockResolvedValue({ id: 'r-1' });
    reviewReport.resolveWithPenalty.mockResolvedValue({ id: 'r-1' });
    reviewReport.bulkUpdate.mockResolvedValue({ count: 2 });

    await controller.updateReport('r-1', 'REVIEWING', 'note', admin);
    await controller.claimReport('r-1', admin);
    await controller.unclaimReport('r-1', admin);
    await controller.reassignReport(
      'r-1',
      { toAdminId: '11111111-1111-1111-1111-111111111111' },
      admin,
    );
    await controller.resolveReportWithPenalty('r-1', 'STRIKE', admin);
    await controller.bulkUpdateReports(
      { ids: ['r-1', 'r-2'], status: 'RESOLVED' },
      admin,
    );
    await controller.bulkUpdateReports(
      { ids: undefined as never, status: 'REJECTED' },
      admin,
    );

    expect(reviewReport.updateStatus).toHaveBeenCalledWith(
      'admin-1',
      'r-1',
      'REVIEWING',
      'note',
    );
    expect(reviewReport.claim).toHaveBeenCalledWith('admin-1', 'r-1');
    expect(reviewReport.unclaim).toHaveBeenCalledWith('admin-1', 'r-1');
    expect(reviewReport.reassign).toHaveBeenCalledWith(
      'admin-1',
      'r-1',
      '11111111-1111-1111-1111-111111111111',
    );
    expect(reviewReport.resolveWithPenalty).toHaveBeenCalledWith(
      'admin-1',
      'r-1',
      'STRIKE',
    );
    expect(reviewReport.bulkUpdate).toHaveBeenNthCalledWith(
      1,
      'admin-1',
      ['r-1', 'r-2'],
      'RESOLVED',
    );
    expect(reviewReport.bulkUpdate).toHaveBeenNthCalledWith(
      2,
      'admin-1',
      [],
      'REJECTED',
    );
  });

  it('lists hashtags, comments and stories without an actor', async () => {
    getContent.getHashtags.mockResolvedValue({ data: [] });
    getContent.getComments.mockResolvedValue({ data: [] });
    getContent.getStories.mockResolvedValue({ data: [] });

    await controller.getHashtags({});
    await controller.getComments({
      page: 3,
      limit: 5,
      search: 'hi',
      userId: 'user-2',
      moderationStatus: 'VISIBLE',
    });
    await controller.getStories({
      expired: 'true',
      userId: 'user-2',
      moderationStatus: 'HIDDEN',
    });

    expect(getContent.getHashtags).toHaveBeenCalledWith(1, 20, undefined);
    expect(getContent.getComments).toHaveBeenCalledWith(
      3,
      5,
      'hi',
      'user-2',
      'VISIBLE',
    );
    expect(getContent.getStories).toHaveBeenCalledWith(1, 10, {
      moderationStatus: 'HIDDEN',
      expired: 'true',
      userId: 'user-2',
    });
  });

  it('lists and reviews promotions as adminId', async () => {
    getPromotions.execute.mockResolvedValue({ data: [] });
    reviewPromotion.execute.mockResolvedValue({ id: 'promo-1' });

    await controller.getPromotions({ status: 'ACTIVE', search: 'ad' });
    await controller.updatePromotionStatus('promo-1', 'PAUSED', 'slow', admin);

    expect(getPromotions.execute).toHaveBeenCalledWith(1, 10, 'ACTIVE', 'ad');
    expect(reviewPromotion.execute).toHaveBeenCalledWith(
      'admin-1',
      'promo-1',
      'PAUSED',
      'slow',
    );
  });

  it('lists the moderation queue and updates status as adminId', async () => {
    getModerationQueue.execute.mockResolvedValue({ data: [] });
    moderateContent.execute.mockResolvedValue({ id: 'post-1' });

    await controller.getModerationQueue({ type: 'POST', search: 'q' });
    await controller.updateModerationStatus(
      'POST',
      'post-1',
      'HIDDEN',
      'nsfw',
      admin,
    );

    expect(getModerationQueue.execute).toHaveBeenCalledWith(1, 10, 'POST', 'q');
    expect(moderateContent.execute).toHaveBeenCalledWith(
      'admin-1',
      'POST',
      'post-1',
      'HIDDEN',
      'nsfw',
    );
  });

  it('reads the trust queue and live list; ends a stream as adminId', async () => {
    getContent.getTrustQueue.mockResolvedValue([]);
    getLiveStreams.execute.mockResolvedValue({ data: [] });
    endLiveStream.execute.mockResolvedValue({ ok: true });

    await controller.getTrustQueue();
    await controller.getLiveStreams({ status: 'LIVE', userId: 'user-2' });
    await controller.endLiveStream('live-1', admin);

    expect(getContent.getTrustQueue).toHaveBeenCalledWith();
    expect(getLiveStreams.execute).toHaveBeenCalledWith(
      1,
      20,
      'LIVE',
      'user-2',
    );
    expect(endLiveStream.execute).toHaveBeenCalledWith('admin-1', 'live-1');
  });
});
