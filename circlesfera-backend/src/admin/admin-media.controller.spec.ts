import { Test, type TestingModule } from '@nestjs/testing';
import { AdminAction } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioService } from '../audio/audio.service.js';
import type { CurrentAdminData } from '../auth/decorators/current-admin.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminService } from './admin.service.js';
import { AdminMediaController } from './admin-media.controller.js';

describe('AdminMediaController', () => {
  let controller: AdminMediaController;

  const admin: CurrentAdminData = {
    adminId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Staff',
    permissions: ['content'],
    roles: ['ADMIN'],
    userId: 'admin-1',
  };

  const dto = {
    title: 'Track',
    artist: 'Artist',
    url: 'https://cdn.example/a.mp3',
    duration: 120,
  };

  const mockAudio = {
    findAllPaginated: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const mockAdmin = {
    logAction: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminMediaController],
      providers: [
        { provide: AudioService, useValue: mockAudio },
        { provide: AdminService, useValue: mockAdmin },
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminMediaController>(AdminMediaController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists audio with default and parsed pagination', async () => {
    mockAudio.findAllPaginated.mockResolvedValue({ data: [] });

    await controller.getAudio();
    await controller.getAudio(2, 5, 'jazz');

    expect(mockAudio.findAllPaginated).toHaveBeenNthCalledWith(
      1,
      1,
      10,
      undefined,
    );
    expect(mockAudio.findAllPaginated).toHaveBeenNthCalledWith(2, 2, 5, 'jazz');
  });

  it('creates audio then logs CREATE_AUDIO as adminId', async () => {
    mockAudio.create.mockResolvedValue({ id: 'audio-1' });
    mockAdmin.logAction.mockResolvedValue(undefined);

    const result = await controller.createAudio(dto, admin);

    expect(mockAudio.create).toHaveBeenCalledWith(dto);
    expect(mockAdmin.logAction).toHaveBeenCalledWith(
      'admin-1',
      AdminAction.CREATE_AUDIO,
      'audio',
      'audio-1',
      'Track: Track by Artist',
    );
    expect(result).toEqual({ id: 'audio-1' });
  });

  it('updates audio then logs UPDATE_AUDIO as adminId', async () => {
    mockAudio.update.mockResolvedValue({ id: 'audio-1' });
    mockAdmin.logAction.mockResolvedValue(undefined);

    await controller.updateAudio('audio-1', dto, admin);

    expect(mockAudio.update).toHaveBeenCalledWith('audio-1', dto);
    expect(mockAdmin.logAction).toHaveBeenCalledWith(
      'admin-1',
      AdminAction.UPDATE_AUDIO,
      'audio',
      'audio-1',
      'Updated track: Track',
    );
  });

  it('deletes audio then logs DELETE_AUDIO as adminId', async () => {
    mockAudio.delete.mockResolvedValue({ ok: true });
    mockAdmin.logAction.mockResolvedValue(undefined);

    await controller.deleteAudio('audio-1', admin);

    expect(mockAudio.delete).toHaveBeenCalledWith('audio-1');
    expect(mockAdmin.logAction).toHaveBeenCalledWith(
      'admin-1',
      AdminAction.DELETE_AUDIO,
      'audio',
      'audio-1',
    );
  });
});
