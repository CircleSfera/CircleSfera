import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountStateService } from '../../auth/services/account-state.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { SocketAuthService } from './socket-auth.service.js';

describe('SocketAuthService', () => {
  let service: SocketAuthService;
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };
  let configService: { getOrThrow: ReturnType<typeof vi.fn> };
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    participant: { findMany: ReturnType<typeof vi.fn> };
  };
  let accountStateService: AccountStateService;

  beforeEach(() => {
    jwtService = { verifyAsync: vi.fn() };
    configService = { getOrThrow: vi.fn().mockReturnValue('test-secret') };
    prisma = {
      user: { findUnique: vi.fn() },
      participant: { findMany: vi.fn() },
    };
    accountStateService = new AccountStateService();

    service = new SocketAuthService(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
      accountStateService,
    );
  });

  describe('extractToken', () => {
    it('extracts token from cookie header', () => {
      const mockClient = {
        handshake: {
          headers: {
            cookie: 'access_token=jwt-token-from-cookie; other=val',
          },
        },
      } as unknown as Socket;

      expect(service.extractToken(mockClient)).toBe('jwt-token-from-cookie');
    });

    it('falls back to Authorization Bearer header', () => {
      const mockClient = {
        handshake: {
          headers: {
            authorization: 'Bearer jwt-token-from-header',
          },
        },
      } as unknown as Socket;

      expect(service.extractToken(mockClient)).toBe('jwt-token-from-header');
    });

    it('returns undefined if no cookie or authorization header is present', () => {
      const mockClient = {
        handshake: {
          headers: {},
        },
      } as unknown as Socket;

      expect(service.extractToken(mockClient)).toBeUndefined();
    });

    it('handles cookie parsing error gracefully and falls back to Bearer header', async () => {
      const cookie = await import('cookie');
      vi.spyOn(cookie, 'parse').mockImplementationOnce(() => {
        throw new Error('Malformed cookie string');
      });

      const mockClient = {
        handshake: {
          headers: {
            cookie: 'invalid',
            authorization: 'Bearer fallback-token',
          },
        },
      } as unknown as Socket;

      expect(service.extractToken(mockClient)).toBe('fallback-token');
    });
  });

  describe('authenticate', () => {
    it('throws UnauthorizedException when no token is found', async () => {
      const mockClient = {
        handshake: { headers: {} },
      } as unknown as Socket;

      await expect(service.authenticate(mockClient)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user does not exist or is deactivated', async () => {
      const mockClient = {
        handshake: { headers: { authorization: 'Bearer token-1' } },
      } as unknown as Socket;

      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
      });
      prisma.user.findUnique.mockResolvedValue({ isActive: false });

      await expect(service.authenticate(mockClient)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user profile is suspended', async () => {
      const mockClient = {
        handshake: { headers: { authorization: 'Bearer token-1' } },
      } as unknown as Socket;

      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        profiles: [{ id: 'p-1', suspendedUntil: new Date(Date.now() + 60000) }],
      });

      await expect(service.authenticate(mockClient)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user is root banned', async () => {
      const mockClient = {
        handshake: { headers: { authorization: 'Bearer token-1' } },
      } as unknown as Socket;

      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        isRootBanned: true,
        rootBanReason: 'TOS violation',
        profiles: [{ id: 'p-1' }],
      });

      await expect(service.authenticate(mockClient)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user profile is account banned', async () => {
      const mockClient = {
        handshake: { headers: { authorization: 'Bearer token-1' } },
      } as unknown as Socket;

      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        isRootBanned: false,
        profiles: [{ id: 'p-1', isAccountBanned: true }],
      });

      await expect(service.authenticate(mockClient)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user has no profiles', async () => {
      const mockClient = {
        handshake: { headers: { authorization: 'Bearer token-1' } },
      } as unknown as Socket;

      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        profiles: [],
      });

      await expect(service.authenticate(mockClient)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns authenticated user and active conversations when valid', async () => {
      const mockClient = {
        handshake: { headers: { authorization: 'Bearer token-1' } },
      } as unknown as Socket;

      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
      });
      prisma.user.findUnique.mockResolvedValue({
        isActive: true,
        profiles: [{ id: 'p-1', suspendedUntil: null }],
      });
      prisma.participant.findMany.mockResolvedValue([
        { conversationId: 'c-1' },
        { conversationId: 'c-2' },
      ]);

      const result = await service.authenticate(mockClient);

      expect(result.user).toEqual({
        sub: 'user-1',
        email: 'test@example.com',
        profileId: 'p-1',
      });
      expect(result.conversationIds).toEqual(new Set(['c-1', 'c-2']));
    });
  });
});
