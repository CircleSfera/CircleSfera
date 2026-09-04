import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhitelistController } from './whitelist.controller.js';
import { WhitelistService } from './whitelist.service.js';

describe('WhitelistController', () => {
  let controller: WhitelistController;

  const mockService = {
    create: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhitelistController],
      providers: [{ provide: WhitelistService, useValue: mockService }],
    }).compile();

    controller = module.get<WhitelistController>(WhitelistController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('forwards the signup body to the service', async () => {
    const dto = { email: 'invite@example.com', name: 'Ada' };
    mockService.create.mockResolvedValue({ id: 'wl-1' });

    await controller.create(dto);

    expect(mockService.create).toHaveBeenCalledWith(dto);
  });
});
