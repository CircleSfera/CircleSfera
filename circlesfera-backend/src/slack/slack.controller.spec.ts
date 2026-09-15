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
import { createControllerApp } from '../common/testing/http-controller.js';
import { SlackController } from './slack.controller.js';
import { SlackGuard } from './slack.guard.js';
import { SlackService } from './slack.service.js';

describe('SlackController', () => {
  let app: INestApplication;

  const mockService = {
    handleStatsCommand: vi.fn(),
    handleUserCommand: vi.fn(),
    handleViewSubmission: vi.fn(),
    handleModerationInteraction: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [SlackController],
      providers: [{ provide: SlackService, useValue: mockService }],
      guards: [{ guard: SlackGuard, mode: 'allow' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes slash commands', async () => {
    mockService.handleStatsCommand.mockResolvedValue({ text: 'stats' });
    mockService.handleUserCommand.mockResolvedValue({ text: 'user' });

    const stats = await request(app.getHttpServer())
      .post('/api/v1/slack/commands')
      .send({ command: '/cs-stats' })
      .expect(200);
    const user = await request(app.getHttpServer())
      .post('/api/v1/slack/commands')
      .send({ command: '/cs-user', text: 'alice' })
      .expect(200);
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/slack/commands')
      .send({ command: '/other' })
      .expect(200);

    expect(stats.body).toEqual({ text: 'stats' });
    expect(user.body).toEqual({ text: 'user' });
    expect(unknown.body).toEqual({
      text: 'Command not recognized: /other',
    });
    expect(mockService.handleStatsCommand).toHaveBeenCalledWith();
    expect(mockService.handleUserCommand).toHaveBeenCalledWith('alice');
  });

  it('ignores interactions without a payload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/slack/interactions')
      .send({})
      .expect(200);

    expect(mockService.handleViewSubmission).not.toHaveBeenCalled();
    expect(mockService.handleModerationInteraction).not.toHaveBeenCalled();
  });

  it('rejects invalid interaction JSON', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/slack/interactions')
      .send({ payload: '{bad' })
      .expect(200);

    expect(res.body).toEqual({ text: 'Invalid payload JSON' });
  });

  it('handles view submissions', async () => {
    const payload = { type: 'view_submission' };
    mockService.handleViewSubmission.mockResolvedValue({ ok: true });

    const res = await request(app.getHttpServer())
      .post('/api/v1/slack/interactions')
      .send({ payload: JSON.stringify(payload) })
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(mockService.handleViewSubmission).toHaveBeenCalledWith(payload);
  });

  it('fires moderation interactions without waiting', async () => {
    const payload = { type: 'block_actions' };
    mockService.handleModerationInteraction.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/api/v1/slack/interactions')
      .send({ payload: JSON.stringify(payload) })
      .expect(200);

    expect(mockService.handleModerationInteraction).toHaveBeenCalledWith(
      payload,
    );
  });
});
