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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
  TEST_UUID,
} from '../common/testing/http-controller.js';
import { InteractiveController } from './interactive.controller.js';
import { InteractiveService } from './interactive.service.js';

describe('InteractiveController', () => {
  let app: INestApplication;

  const mockService = {
    createPoll: vi.fn(),
    getPoll: vi.fn(),
    votePoll: vi.fn(),
    createQnaBox: vi.fn(),
    getQnaBox: vi.fn(),
    answerQna: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [InteractiveController],
      providers: [{ provide: InteractiveService, useValue: mockService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: JwtOptionalGuard, mode: 'optional' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects poll create without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/interactive/poll')
      .send({ question: 'A or B?', options: ['A', 'B'] })
      .expect(401);

    expect(mockService.createPoll).not.toHaveBeenCalled();
  });

  it('rejects poll create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/interactive/poll')
      .set(BEARER)
      .send({
        question: 'A or B?',
        options: ['A', 'B'],
        authorId: 'attacker',
      })
      .expect(400);

    expect(mockService.createPoll).not.toHaveBeenCalled();
  });

  it('creates a poll as the session profile', async () => {
    mockService.createPoll.mockResolvedValue({ id: 'poll-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/interactive/poll')
      .set(BEARER)
      .send({ question: 'A or B?', options: ['A', 'B'] })
      .expect(201);

    expect(res.body).toEqual({ id: 'poll-1' });
    expect(mockService.createPoll).toHaveBeenCalledWith(TEST_USER.profileId, {
      question: 'A or B?',
      options: ['A', 'B'],
    });
  });

  it('loads a poll with the viewer profile when present', async () => {
    mockService.getPoll.mockResolvedValue({ id: 'poll-1' });

    await request(app.getHttpServer())
      .get('/api/v1/interactive/poll/poll-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.getPoll).toHaveBeenCalledWith(
      'poll-1',
      TEST_USER.profileId,
    );
  });

  it('loads a poll without a profile when anonymous', async () => {
    mockService.getPoll.mockResolvedValue({ id: 'poll-1' });

    await request(app.getHttpServer())
      .get('/api/v1/interactive/poll/poll-1')
      .expect(200);

    expect(mockService.getPoll).toHaveBeenCalledWith('poll-1', undefined);
  });

  it('votes as the session profile and unwraps the body', async () => {
    mockService.votePoll.mockResolvedValue({ id: 'vote-1' });

    await request(app.getHttpServer())
      .post('/api/v1/interactive/poll/vote')
      .set(BEARER)
      .send({ pollId: TEST_UUID, optionIndex: 1 })
      .expect(200);

    expect(mockService.votePoll).toHaveBeenCalledWith(
      TEST_USER.profileId,
      TEST_UUID,
      1,
    );
  });

  it('creates a Q&A box as the session profile', async () => {
    mockService.createQnaBox.mockResolvedValue({ id: 'qna-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/interactive/qna')
      .set(BEARER)
      .send({ prompt: 'Ask me anything' })
      .expect(201);

    expect(res.body).toEqual({ id: 'qna-1' });
    expect(mockService.createQnaBox).toHaveBeenCalledWith(TEST_USER.profileId, {
      prompt: 'Ask me anything',
    });
  });

  it('loads a Q&A box without a viewer profile', async () => {
    mockService.getQnaBox.mockResolvedValue({ id: 'qna-1' });

    await request(app.getHttpServer())
      .get('/api/v1/interactive/qna/qna-1')
      .expect(200);

    expect(mockService.getQnaBox).toHaveBeenCalledWith('qna-1');
  });

  it('answers a Q&A box as the session profile and unwraps the body', async () => {
    mockService.answerQna.mockResolvedValue({ id: 'ans-1' });

    await request(app.getHttpServer())
      .post('/api/v1/interactive/qna/answer')
      .set(BEARER)
      .send({ qnaBoxId: TEST_UUID, answerText: 'Yes' })
      .expect(201);

    expect(mockService.answerQna).toHaveBeenCalledWith(
      TEST_USER.profileId,
      TEST_UUID,
      'Yes',
    );
  });
});
