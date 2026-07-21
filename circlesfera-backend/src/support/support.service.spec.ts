import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import { SupportService } from './support.service.js';

describe('SupportService', () => {
  let service: SupportService;

  const mockPrismaService = {
    supportTicket: {
      create: vi.fn(),
    },
  };

  const mockSlackService = {
    sendSupportAlert: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SlackService, useValue: mockSlackService },
      ],
    }).compile();

    service = module.get<SupportService>(SupportService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTicket', () => {
    it('should create a support ticket and notify Slack', async () => {
      const dto = {
        email: 'user@example.com',
        subject: 'Payment Issue',
        message: 'I cannot unlock post',
        userId: 'user-1',
      };

      mockPrismaService.supportTicket.create.mockResolvedValue({
        id: 'ticket-1',
        ...dto,
      });

      const result = await service.createTicket(dto);

      expect(mockPrismaService.supportTicket.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          subject: dto.subject,
          message: dto.message,
          userId: dto.userId,
        },
      });
      expect(mockSlackService.sendSupportAlert).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Support ticket created successfully',
        ticketId: 'ticket-1',
      });
    });
  });
});
