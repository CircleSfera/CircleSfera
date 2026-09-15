import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
  TEST_UUID,
} from '../common/testing/http-controller.js';
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
  let app: INestApplication;

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

  beforeAll(async () => {
    app = await createControllerApp({
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
      guards: [
        { guard: AdminJwtAuthGuard, mode: 'admin' },
        { guard: AdminGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects posts list without credentials', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/posts').expect(401);

    expect(getPosts.execute).not.toHaveBeenCalled();
  });

  it('rejects posts list with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/posts')
      .set(BEARER)
      .expect(401);

    expect(getPosts.execute).not.toHaveBeenCalled();
  });

  it('rejects reassign with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/reports/${TEST_UUID}/reassign`)
      .set(ADMIN_BEARER)
      .send({ toAdminId: TEST_UUID, extra: 'nope' })
      .expect(400);

    expect(reviewReport.reassign).not.toHaveBeenCalled();
  });

  it('lists posts with default pagination and filters', async () => {
    getPosts.execute.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/posts')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/posts')
      .query({
        page: 2,
        limit: 20,
        search: 'q',
        type: 'FRAME',
        userId: TEST_UUID,
        moderationStatus: 'HIDDEN',
      })
      .set(ADMIN_BEARER)
      .expect(200);

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
      TEST_UUID,
      'HIDDEN',
    );
  });

  it('exports posts CSV without an actor', async () => {
    getContent.exportPostsCSV.mockResolvedValue('id,caption\n');

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/posts/export')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toBe('id,caption\n');
    expect(getContent.exportPostsCSV).toHaveBeenCalledWith();
  });

  it('deletes post, comment and story as adminId', async () => {
    deletePost.execute.mockResolvedValue({ ok: true });
    deleteComment.execute.mockResolvedValue({ ok: true });
    deleteStory.execute.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .delete('/api/v1/admin/posts/post-1')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/comments/c-1')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/stories/story-1')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(deletePost.execute).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'post-1',
    );
    expect(deleteComment.execute).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'c-1',
    );
    expect(deleteStory.execute).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'story-1',
    );
  });

  it('lists reports with default pagination', async () => {
    getReports.execute.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/reports')
      .set(ADMIN_BEARER)
      .expect(200);

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

    await request(app.getHttpServer())
      .patch('/api/v1/admin/reports/r-1')
      .set(ADMIN_BEARER)
      .send({ status: 'REVIEWING', internalNotes: 'note' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/admin/reports/r-1/claim')
      .set(ADMIN_BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/reports/r-1/unclaim')
      .set(ADMIN_BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/reports/r-1/reassign')
      .set(ADMIN_BEARER)
      .send({ toAdminId: TEST_UUID })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/reports/r-1/resolve-penalty')
      .set(ADMIN_BEARER)
      .send({ action: 'STRIKE' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/reports/bulk')
      .set(ADMIN_BEARER)
      .send({ ids: ['r-1', 'r-2'], status: 'RESOLVED' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/reports/bulk')
      .set(ADMIN_BEARER)
      .send({ status: 'REJECTED' })
      .expect(201);

    expect(reviewReport.updateStatus).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'r-1',
      'REVIEWING',
      'note',
    );
    expect(reviewReport.claim).toHaveBeenCalledWith(TEST_ADMIN.adminId, 'r-1');
    expect(reviewReport.unclaim).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'r-1',
    );
    expect(reviewReport.reassign).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'r-1',
      TEST_UUID,
    );
    expect(reviewReport.resolveWithPenalty).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'r-1',
      'STRIKE',
    );
    expect(reviewReport.bulkUpdate).toHaveBeenNthCalledWith(
      1,
      TEST_ADMIN.adminId,
      ['r-1', 'r-2'],
      'RESOLVED',
    );
    expect(reviewReport.bulkUpdate).toHaveBeenNthCalledWith(
      2,
      TEST_ADMIN.adminId,
      [],
      'REJECTED',
    );
  });

  it('lists hashtags, comments and stories without an actor', async () => {
    getContent.getHashtags.mockResolvedValue({ data: [] });
    getContent.getComments.mockResolvedValue({ data: [] });
    getContent.getStories.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/hashtags')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/comments')
      .query({
        page: 3,
        limit: 5,
        search: 'hi',
        userId: TEST_UUID,
        moderationStatus: 'VISIBLE',
      })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/stories')
      .query({
        expired: 'true',
        userId: TEST_UUID,
        moderationStatus: 'HIDDEN',
      })
      .set(ADMIN_BEARER)
      .expect(200);

    expect(getContent.getHashtags).toHaveBeenCalledWith(1, 10, undefined);
    expect(getContent.getComments).toHaveBeenCalledWith(
      3,
      5,
      'hi',
      TEST_UUID,
      'VISIBLE',
    );
    expect(getContent.getStories).toHaveBeenCalledWith(1, 10, {
      moderationStatus: 'HIDDEN',
      expired: 'true',
      userId: TEST_UUID,
    });
  });

  it('lists and reviews promotions as adminId', async () => {
    getPromotions.execute.mockResolvedValue({ data: [] });
    reviewPromotion.execute.mockResolvedValue({ id: 'promo-1' });

    await request(app.getHttpServer())
      .get('/api/v1/admin/promotions')
      .query({ status: 'ACTIVE', search: 'ad' })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/promotions/promo-1')
      .set(ADMIN_BEARER)
      .send({ status: 'PAUSED', note: 'slow' })
      .expect(200);

    expect(getPromotions.execute).toHaveBeenCalledWith(1, 10, 'ACTIVE', 'ad');
    expect(reviewPromotion.execute).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'promo-1',
      'PAUSED',
      'slow',
    );
  });

  it('lists the moderation queue and updates status as adminId', async () => {
    getModerationQueue.execute.mockResolvedValue({ data: [] });
    moderateContent.execute.mockResolvedValue({ id: 'post-1' });

    await request(app.getHttpServer())
      .get('/api/v1/admin/moderation/queue')
      .query({ type: 'POST', search: 'q' })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/moderation/POST/post-1')
      .set(ADMIN_BEARER)
      .send({ status: 'HIDDEN', note: 'nsfw' })
      .expect(200);

    expect(getModerationQueue.execute).toHaveBeenCalledWith(1, 10, 'POST', 'q');
    expect(moderateContent.execute).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
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

    await request(app.getHttpServer())
      .get('/api/v1/admin/trust/queue')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/live')
      .query({ status: 'LIVE', userId: TEST_UUID })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/admin/live/live-1/end')
      .set(ADMIN_BEARER)
      .expect(201);

    expect(getContent.getTrustQueue).toHaveBeenCalledWith();
    expect(getLiveStreams.execute).toHaveBeenCalledWith(
      1,
      10,
      'LIVE',
      TEST_UUID,
    );
    expect(endLiveStream.execute).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'live-1',
    );
  });
});
