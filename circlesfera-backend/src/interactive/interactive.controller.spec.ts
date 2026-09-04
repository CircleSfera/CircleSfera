import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { InteractiveController } from './interactive.controller.js';
import { InteractiveService } from './interactive.service.js';

describe('InteractiveController', () => {
  let controller: InteractiveController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    createPoll: vi.fn(),
    getPoll: vi.fn(),
    votePoll: vi.fn(),
    createQnaBox: vi.fn(),
    getQnaBox: vi.fn(),
    answerQna: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InteractiveController],
      providers: [{ provide: InteractiveService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtOptionalGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InteractiveController>(InteractiveController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a poll as the caller profile', async () => {
    const dto = { question: 'A or B?', options: ['A', 'B'] };
    mockService.createPoll.mockResolvedValue({ id: 'poll-1' });

    await controller.createPoll(mockUser, dto);

    expect(mockService.createPoll).toHaveBeenCalledWith('profile-1', dto);
  });

  it('loads a poll with the viewer profile when present', async () => {
    mockService.getPoll.mockResolvedValue({ id: 'poll-1' });

    await controller.getPoll('poll-1', 'profile-1');

    expect(mockService.getPoll).toHaveBeenCalledWith('poll-1', 'profile-1');
  });

  it('loads a poll without a profile when anonymous', async () => {
    mockService.getPoll.mockResolvedValue({ id: 'poll-1' });

    await controller.getPoll('poll-1', null);

    expect(mockService.getPoll).toHaveBeenCalledWith('poll-1', undefined);
  });

  it('votes as the caller profile and unwraps the body', async () => {
    mockService.votePoll.mockResolvedValue({ id: 'vote-1' });

    await controller.votePoll(mockUser, {
      pollId: 'poll-1',
      optionIndex: 1,
    });

    expect(mockService.votePoll).toHaveBeenCalledWith('profile-1', 'poll-1', 1);
  });

  it('creates a Q&A box as the caller profile', async () => {
    const dto = { prompt: 'Ask me anything' };
    mockService.createQnaBox.mockResolvedValue({ id: 'qna-1' });

    await controller.createQnaBox(mockUser, dto);

    expect(mockService.createQnaBox).toHaveBeenCalledWith('profile-1', dto);
  });

  it('loads a Q&A box without a viewer profile', async () => {
    mockService.getQnaBox.mockResolvedValue({ id: 'qna-1' });

    await controller.getQnaBox('qna-1');

    expect(mockService.getQnaBox).toHaveBeenCalledWith('qna-1');
  });

  it('answers a Q&A box as the caller profile and unwraps the body', async () => {
    mockService.answerQna.mockResolvedValue({ id: 'ans-1' });

    await controller.answerQna(mockUser, {
      qnaBoxId: 'qna-1',
      answerText: 'Yes',
    });

    expect(mockService.answerQna).toHaveBeenCalledWith(
      'profile-1',
      'qna-1',
      'Yes',
    );
  });
});
