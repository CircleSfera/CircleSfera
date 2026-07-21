import { getQueueToken } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  const mockJwtService = {
    sign: vi.fn(() => 'mock-token'),
    verify: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      return null;
    }),
  };

  const mockEmailService = {
    sendVerificationEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };

  const mockUsersQueue = {
    add: vi.fn(),
    getJob: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
        {
          provide: getQueueToken('users-processing'),
          useValue: mockUsersQueue,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const dto = {
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
      fullName: 'Test User',
    };

    it('should hash password with argon2 and create user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: '1',
        email: dto.email,
      });

      const result = await service.register(dto);

      expect(mockPrismaService.user.create).toHaveBeenCalled();
      const createArgs = mockPrismaService.user.create.mock.calls[0][0] as {
        data: { password: string };
      };
      expect(createArgs.data.password).toContain('$argon2');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw ConflictException if email exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: '1' });
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const dto = {
      identifier: 'test@example.com',
      password: 'password123',
    };

    it('should login successfully with argon2 hash', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.identifier,
        password: argonHash,
        isActive: true,
      });

      const result = await service.login(dto);
      expect(result).toHaveProperty('accessToken');
    });

    it('should fallback to bcrypt and migrate to argon2', async () => {
      const bcryptHash = await bcrypt.hash(dto.password, 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.identifier,
        password: bcryptHash,
        isActive: true,
      });

      const result = await service.login(dto);

      expect(mockPrismaService.user.update).toHaveBeenCalled();
      const updateArgs = mockPrismaService.user.update.mock.calls[0][0] as {
        data: { password: string };
      };
      expect(updateArgs.data.password).toContain('$argon2');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const argonHash = await argon2.hash('wrongpassword');
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.identifier,
        password: argonHash,
        isActive: true,
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for deactivated account', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.identifier,
        password: argonHash,
        isActive: false,
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: '1' });
      const result = await service.verifyEmail({ token: 'token' });
      expect(mockPrismaService.user.update).toHaveBeenCalled();
      expect(result.message).toContain('successfully');
    });

    it('should throw BadRequestException for invalid token', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyEmail({ token: 'invalid' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('should generate reset token and send email', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
      });
      const result = await service.requestPasswordReset({
        email: 'test@example.com',
      });
      expect(mockPrismaService.user.update).toHaveBeenCalled();
      expect(result.message).toContain('email has been sent');
    });
  });

  describe('resetPassword', () => {
    it('should reset password with argon2 hash', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        resetTokenExpires: new Date(Date.now() + 100000),
      });
      const result = await service.resetPassword({
        token: 'token',
        newPassword: 'newPassword123',
      });
      expect(mockPrismaService.user.update).toHaveBeenCalled();
      expect(result.message).toContain('successfully');

      const updateArgs = mockPrismaService.user.update.mock.calls[
        mockPrismaService.user.update.mock.calls.length - 1
      ][0] as { data: { password: string } };
      expect(updateArgs.data.password).toContain('$argon2');
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens successfully', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: '1',
        email: 'test@example.com',
      });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 'token-id',
        userId: '1',
        expiresAt: new Date(Date.now() + 100000),
      });

      const result = await service.refreshToken({
        refreshToken: 'mock-refresh',
      });
      expect(result).toHaveProperty('accessToken');
      expect(mockPrismaService.refreshToken.delete).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should delete refresh tokens', async () => {
      await service.logout('1', 'token');
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalled();
    });
  });
});
