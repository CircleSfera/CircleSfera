import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SupportService } from './support.service.js';

describe('SupportService', () => {
  let service: SupportService;

  const mockPrismaService = {
    supportTicket: {
      create: vi.fn(),
    },
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<SupportService>(SupportService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTicket', () => {
    it('stores the category the participant chose', async () => {
      mockPrismaService.supportTicket.create.mockResolvedValue({ id: 't-2' });

      await service.createTicket({
        email: 'user@example.com',
        subject: 'Charged twice',
        message: 'I was charged twice',
        userId: 'user-1',
        category: 'PAYMENTS',
      });

      expect(mockPrismaService.supportTicket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ category: 'PAYMENTS' }),
      });
    });

    it('should create a support ticket and emit a support.ticket_created event', async () => {
      const dto = {
        email: 'user@example.com',
        subject: 'Payment Issue',
        message: 'I cannot unlock post',
        userId: 'user-1',
      };

      const ticket = { id: 'ticket-1', ...dto };
      mockPrismaService.supportTicket.create.mockResolvedValue(ticket);

      const result = await service.createTicket(dto);

      expect(mockPrismaService.supportTicket.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          subject: dto.subject,
          message: dto.message,
          category: undefined,
          userId: dto.userId,
        },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'support.ticket_created',
        ticket,
      );
      expect(result).toEqual({
        success: true,
        message: 'Support ticket created successfully',
        ticketId: 'ticket-1',
      });
    });
  });
});
