import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaAuthService } from './media-auth.service.js';

describe('MediaAuthService', () => {
  let service: MediaAuthService;

  const mockPrismaService = {
    postMedia: {
      findFirst: vi.fn(),
    },
    postUnlock: {
      findUnique: vi.fn(),
    },
    follow: {
      findFirst: vi.fn(),
    },
    closeFriend: {
      findFirst: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaAuthService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MediaAuthService>(MediaAuthService);
  });

  it('blocks direct static access to GDPR export artifacts', async () => {
    expect(
      await service.isAccessAllowed(
        '/uploads/exports/archive.zip',
        'user-1',
        'profile-1',
      ),
    ).toBe(false);
    expect(
      await service.isAccessAllowed(
        'exports/archive.zip',
        'user-1',
        'profile-1',
      ),
    ).toBe(false);
    expect(
      await service.isAccessAllowed(
        '/uploads/exports/sub/archive.zip',
        null,
        null,
      ),
    ).toBe(false);
    expect(mockPrismaService.postMedia.findFirst).not.toHaveBeenCalled();
  });

  it('allows public asset access when no post media row exists', async () => {
    mockPrismaService.postMedia.findFirst.mockResolvedValue(null);
    expect(
      await service.isAccessAllowed('/uploads/avatars/user.png', null, null),
    ).toBe(true);
  });
});
