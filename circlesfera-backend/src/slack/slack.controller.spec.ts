import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SlackController } from './slack.controller.js';
import { SlackGuard } from './slack.guard.js';
import { SlackService } from './slack.service.js';

describe('SlackController', () => {
  let controller: SlackController;

  const mockService = {
    handleStatsCommand: vi.fn(),
    handleUserCommand: vi.fn(),
    handleViewSubmission: vi.fn(),
    handleModerationInteraction: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlackController],
      providers: [{ provide: SlackService, useValue: mockService }],
    })
      .overrideGuard(SlackGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SlackController>(SlackController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('routes slash commands', async () => {
    mockService.handleStatsCommand.mockResolvedValue({ text: 'stats' });
    mockService.handleUserCommand.mockResolvedValue({ text: 'user' });

    await controller.handleCommands({ command: '/cs-stats' });
    await controller.handleCommands({ command: '/cs-user', text: 'alice' });
    const unknown = await controller.handleCommands({ command: '/other' });

    expect(mockService.handleStatsCommand).toHaveBeenCalledWith();
    expect(mockService.handleUserCommand).toHaveBeenCalledWith('alice');
    expect(unknown).toEqual({ text: 'Command not recognized: /other' });
  });

  it('ignores interactions without a payload', async () => {
    await expect(controller.handleInteractions({})).resolves.toBeUndefined();
    expect(mockService.handleViewSubmission).not.toHaveBeenCalled();
    expect(mockService.handleModerationInteraction).not.toHaveBeenCalled();
  });

  it('rejects invalid interaction JSON', async () => {
    await expect(
      controller.handleInteractions({ payload: '{bad' }),
    ).resolves.toEqual({ text: 'Invalid payload JSON' });
  });

  it('handles view submissions', async () => {
    const payload = { type: 'view_submission' };
    mockService.handleViewSubmission.mockResolvedValue({ ok: true });

    await controller.handleInteractions({ payload: JSON.stringify(payload) });

    expect(mockService.handleViewSubmission).toHaveBeenCalledWith(payload);
  });

  it('fires moderation interactions without waiting', async () => {
    const payload = { type: 'block_actions' };
    mockService.handleModerationInteraction.mockResolvedValue(undefined);

    const result = await controller.handleInteractions({
      payload: JSON.stringify(payload),
    });

    expect(mockService.handleModerationInteraction).toHaveBeenCalledWith(
      payload,
    );
    expect(result).toBeUndefined();
  });
});
