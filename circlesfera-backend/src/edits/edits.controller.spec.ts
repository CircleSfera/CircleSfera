import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { EditsController } from './edits.controller.js';
import { EditsService } from './edits.service.js';

describe('EditsController', () => {
  let controller: EditsController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    startCaptions: vi.fn(),
    getCaptionsJob: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EditsController],
      providers: [{ provide: EditsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EditsController>(EditsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates an edit as the caller profile', async () => {
    const dto = {
      mediaUrl: 'https://cdn.example/clip.mp4',
      state: { clips: [] },
    };
    mockService.create.mockResolvedValue({ id: 'edit-1' });

    await controller.create(mockUser, dto);

    expect(mockService.create).toHaveBeenCalledWith('profile-1', dto);
  });

  it('lists edits as the caller profile', async () => {
    mockService.findAll.mockResolvedValue([]);

    await controller.findAll(mockUser);

    expect(mockService.findAll).toHaveBeenCalledWith('profile-1');
  });

  it('starts captions as the caller profile and unwraps clipId', async () => {
    mockService.startCaptions.mockResolvedValue({ jobId: 'job-1' });

    await controller.startCaptions(mockUser, 'edit-1', { clipId: 'clip-1' });

    expect(mockService.startCaptions).toHaveBeenCalledWith(
      'profile-1',
      'edit-1',
      'clip-1',
    );
  });

  it('reads a captions job as the caller profile', async () => {
    mockService.getCaptionsJob.mockResolvedValue({ status: 'done' });

    await controller.getCaptionsJob(mockUser, 'edit-1', 'job-1');

    expect(mockService.getCaptionsJob).toHaveBeenCalledWith(
      'profile-1',
      'edit-1',
      'job-1',
    );
  });

  it('reads, updates and deletes an edit as the caller profile', async () => {
    const dto = { name: 'Cut 2' };
    mockService.findOne.mockResolvedValue({ id: 'edit-1' });
    mockService.update.mockResolvedValue({ id: 'edit-1' });
    mockService.remove.mockResolvedValue(undefined);

    await controller.findOne(mockUser, 'edit-1');
    await controller.update(mockUser, 'edit-1', dto);
    await controller.remove(mockUser, 'edit-1');

    expect(mockService.findOne).toHaveBeenCalledWith('profile-1', 'edit-1');
    expect(mockService.update).toHaveBeenCalledWith('profile-1', 'edit-1', dto);
    expect(mockService.remove).toHaveBeenCalledWith('profile-1', 'edit-1');
  });
});
