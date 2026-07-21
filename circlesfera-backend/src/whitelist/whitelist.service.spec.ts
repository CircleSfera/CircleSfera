import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WhitelistService } from './whitelist.service.js';

describe('WhitelistService', () => {
  let service: WhitelistService;

  const mockPrismaService = {
    whitelistEntry: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const mockEmailService = {
    sendWelcomeEmail: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhitelistService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<WhitelistService>(WhitelistService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw ConflictException if email is already whitelisted', async () => {
      mockPrismaService.whitelistEntry.findUnique.mockResolvedValue({
        id: 'w-1',
        email: 'test@example.com',
      });

      await expect(
        service.create({ email: 'test@example.com', name: 'Test User' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create whitelist entry and send welcome email', async () => {
      mockPrismaService.whitelistEntry.findUnique.mockResolvedValue(null);
      mockPrismaService.whitelistEntry.create.mockResolvedValue({
        id: 'w-1',
        email: 'new@example.com',
        name: 'New User',
        status: 'VALID',
      });

      const result = await service.create({
        email: 'new@example.com',
        name: 'New User',
      });

      expect(mockPrismaService.whitelistEntry.create).toHaveBeenCalledWith({
        data: {
          email: 'new@example.com',
          name: 'New User',
          status: 'VALID',
        },
      });
      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(
        'new@example.com',
        'New User',
      );
      expect(result).toHaveProperty('id', 'w-1');
    });
  });

  describe('findAll', () => {
    it('should return list of whitelisted entries', async () => {
      mockPrismaService.whitelistEntry.findMany.mockResolvedValue([
        { id: 'w-1', email: 'user@example.com' },
      ]);

      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });
});
