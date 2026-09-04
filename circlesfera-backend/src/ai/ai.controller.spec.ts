import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AIController } from './ai.controller.js';
import { AIService } from './ai.service.js';

describe('AIController', () => {
  let controller: AIController;

  const mockService = {
    generateAltText: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AIController],
      providers: [{ provide: AIService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AIController>(AIController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('generates alt text from the imageUrl and wraps the result', async () => {
    mockService.generateAltText.mockResolvedValue('A cat on a sofa');

    const result = await controller.generateAltText({
      imageUrl: 'https://cdn.example/cat.jpg',
    });

    expect(mockService.generateAltText).toHaveBeenCalledWith(
      'https://cdn.example/cat.jpg',
    );
    expect(result).toEqual({ text: 'A cat on a sofa' });
  });
});
