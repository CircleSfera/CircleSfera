import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

describe('ProfilesController', () => {
  let controller: ProfilesController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    searchProfiles: vi.fn(),
    getMyReferrals: vi.fn(),
    getMyProfile: vi.fn(),
    checkUsernameAvailability: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    deactivateAccount: vi.fn(),
    deleteAccount: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [{ provide: ProfilesService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProfilesController>(ProfilesController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('searches profiles without a caller profile', async () => {
    mockService.searchProfiles.mockResolvedValue([]);

    await controller.searchProfiles('alice');

    expect(mockService.searchProfiles).toHaveBeenCalledWith('alice');
  });

  it('loads referrals and own profile as the caller profile', async () => {
    mockService.getMyReferrals.mockResolvedValue([]);
    mockService.getMyProfile.mockResolvedValue({ id: 'profile-1' });

    await controller.getMyReferrals(mockUser);
    await controller.getMyProfile(mockUser);

    expect(mockService.getMyReferrals).toHaveBeenCalledWith('profile-1');
    expect(mockService.getMyProfile).toHaveBeenCalledWith('profile-1');
  });

  it('checks username availability and loads a public profile by username', async () => {
    mockService.checkUsernameAvailability.mockResolvedValue({
      available: true,
    });
    mockService.getProfile.mockResolvedValue({ username: 'alice' });

    await controller.checkUsername('alice');
    await controller.getProfile('alice');

    expect(mockService.checkUsernameAvailability).toHaveBeenCalledWith('alice');
    expect(mockService.getProfile).toHaveBeenCalledWith('alice');
  });

  it('updates the caller profile', async () => {
    const dto = { bio: 'Hello' };
    mockService.updateProfile.mockResolvedValue({ id: 'profile-1' });

    await controller.updateProfile(mockUser, dto);

    expect(mockService.updateProfile).toHaveBeenCalledWith('profile-1', dto);
  });

  it('deactivates and deletes as the caller profile', async () => {
    mockService.deactivateAccount.mockResolvedValue({ ok: true });
    mockService.deleteAccount.mockResolvedValue({ ok: true });

    await controller.deactivateAccount(mockUser);
    await controller.deleteAccount(mockUser);

    expect(mockService.deactivateAccount).toHaveBeenCalledWith('profile-1');
    expect(mockService.deleteAccount).toHaveBeenCalledWith('profile-1');
  });
});
