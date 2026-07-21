import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from './slack.service.js';

describe('SlackService', () => {
  let service: SlackService;

  const mockPrismaService = {
    user: {
      count: vi.fn(),
    },
    post: {
      count: vi.fn(),
    },
    report: {
      count: vi.fn(),
    },
  };

  const mockEmailService = {
    sendEmail: vi.fn(),
  };

  const mockAIService = {
    generateMorningBriefing: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'SLACK_BOT_TOKEN') return 'xoxb-mock-token';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AIService, useValue: mockAIService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SlackService>(SlackService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendProductionAlert', () => {
    it('should skip gracefully if no webhook URL is configured', async () => {
      await expect(
        service.sendProductionAlert({
          message: 'Unhandled Exception',
          path: '/api/v1/test',
        }),
      ).resolves.not.toThrow();
    });
  });
});
