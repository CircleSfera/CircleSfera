import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';

describe('SupportController', () => {
  let controller: SupportController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    createTicket: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupportController],
      providers: [{ provide: SupportService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SupportController>(SupportController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a ticket with the caller userId and email', async () => {
    const dto = { subject: 'Help', message: 'Cannot login' };
    mockService.createTicket.mockResolvedValue({ id: 'ticket-1' });

    await controller.createTicket(mockUser, dto);

    expect(mockService.createTicket).toHaveBeenCalledWith({
      ...dto,
      email: 'test@example.com',
      userId: 'user-1',
    });
  });

  it('overwrites client-supplied email and userId with the caller identity', async () => {
    mockService.createTicket.mockResolvedValue({ id: 'ticket-1' });

    await controller.createTicket(mockUser, {
      subject: 'Help',
      message: 'Cannot login',
      email: 'spoof@example.com',
      userId: 'other-user',
    });

    expect(mockService.createTicket).toHaveBeenCalledWith({
      subject: 'Help',
      message: 'Cannot login',
      email: 'test@example.com',
      userId: 'user-1',
    });
  });
});
