import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AudioController } from './audio.controller.js';
import { AudioService } from './audio.service.js';

describe('AudioController', () => {
  let controller: AudioController;

  const mockService = {
    create: vi.fn(),
    findAll: vi.fn(),
    search: vi.fn(),
    getTrending: vi.fn(),
    findOne: vi.fn(),
    getAudioPosts: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AudioController],
      providers: [{ provide: AudioService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AudioController>(AudioController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a track from the body without an actor id', async () => {
    const dto = {
      title: 'Track',
      artist: 'Artist',
      url: 'https://cdn.example/a.mp3',
      duration: 120,
    };
    mockService.create.mockResolvedValue({ id: 'audio-1' });

    await controller.create(dto);

    expect(mockService.create).toHaveBeenCalledWith(dto);
  });

  it('lists, searches and loads trending tracks', async () => {
    mockService.findAll.mockResolvedValue([]);
    mockService.search.mockResolvedValue([]);
    mockService.getTrending.mockResolvedValue([]);

    await controller.findAll();
    await controller.search('jazz');
    await controller.getTrending();

    expect(mockService.findAll).toHaveBeenCalledWith();
    expect(mockService.search).toHaveBeenCalledWith('jazz');
    expect(mockService.getTrending).toHaveBeenCalledWith();
  });

  it('loads one track and its posts by id', async () => {
    mockService.findOne.mockResolvedValue({ id: 'audio-1' });
    mockService.getAudioPosts.mockResolvedValue([]);

    await controller.findOne('audio-1');
    await controller.getPosts('audio-1');

    expect(mockService.findOne).toHaveBeenCalledWith('audio-1');
    expect(mockService.getAudioPosts).toHaveBeenCalledWith('audio-1');
  });
});
