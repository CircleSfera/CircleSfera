import { ApiErrorCode } from '@circlesfera/shared';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountStateService } from '../../auth/services/account-state.service.js';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AppGateway, type SocketWithAuth } from '../../socket/app.gateway.js';
import { SocketAuthService } from '../../socket/services/socket-auth.service.js';

describe('Cross-Surface Account State Enforcement Policy Invariants', () => {
  let accountStateService: AccountStateService;

  beforeEach(() => {
    accountStateService = new AccountStateService();
  });

  describe('REST Surface (JwtStrategy)', () => {
    let strategy: JwtStrategy;
    let mockPrisma: any;
    let mockConfigService: any;

    beforeEach(() => {
      mockPrisma = {
        user: { findUnique: vi.fn() },
        profile: { findFirst: vi.fn() },
      };
      mockConfigService = {
        getOrThrow: vi
          .fn()
          .mockReturnValue('test-secret-32-chars-long-minimum'),
      };
      strategy = new JwtStrategy(
        mockConfigService,
        mockPrisma as unknown as PrismaService,
        accountStateService,
      );
    });

    it('rejects root-banned user with ApiErrorCode.ACCOUNT_BANNED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-banned',
        isActive: true,
        isRootBanned: true,
        rootBanReason: 'Fraudulent platform activity',
        email: 'banned@example.com',
      });
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'p-1',
      });

      await expect(
        strategy.validate({ sub: 'u-banned', email: 'banned@example.com' }),
      ).rejects.toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: 'Fraudulent platform activity',
        }),
      );
    });

    it('rejects profile-banned user with ApiErrorCode.ACCOUNT_BANNED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-prof-banned',
        isActive: true,
        isRootBanned: false,
        email: 'profbanned@example.com',
      });
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'p-banned',
        isAccountBanned: true,
        accountBanReason: 'Severe harassment violation',
      });

      await expect(
        strategy.validate({
          sub: 'u-prof-banned',
          email: 'profbanned@example.com',
        }),
      ).rejects.toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: 'Severe harassment violation',
        }),
      );
    });

    it('rejects temporarily suspended profile with ApiErrorCode.ACCOUNT_SUSPENDED', async () => {
      const future = new Date(Date.now() + 86400 * 1000);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-suspended',
        isActive: true,
        isRootBanned: false,
        email: 'suspended@example.com',
      });
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'p-susp',
        isAccountBanned: false,
        suspendedUntil: future,
      });

      await expect(
        strategy.validate({
          sub: 'u-suspended',
          email: 'suspended@example.com',
        }),
      ).rejects.toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_SUSPENDED,
          suspendedUntil: future.toISOString(),
        }),
      );
    });

    it('rejects deactivated account with standard 401', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-deactivated',
        isActive: false,
      });

      await expect(
        strategy.validate({ sub: 'u-deactivated', email: 'deact@example.com' }),
      ).rejects.toThrow(
        new UnauthorizedException('User not found or account deactivated'),
      );
    });
  });

  describe('Realtime WebSocket Handshake (SocketAuthService)', () => {
    let socketAuthService: SocketAuthService;
    let mockJwtService: any;
    let mockConfigService: any;
    let mockPrisma: any;

    beforeEach(() => {
      mockJwtService = { verifyAsync: vi.fn() };
      mockConfigService = {
        getOrThrow: vi.fn().mockReturnValue('test-secret'),
      };
      mockPrisma = {
        user: { findUnique: vi.fn() },
        participant: { findMany: vi.fn() },
      };
      socketAuthService = new SocketAuthService(
        mockJwtService as unknown as JwtService,
        mockConfigService as unknown as ConfigService,
        mockPrisma as unknown as PrismaService,
        accountStateService,
      );
    });

    it('rejects root-banned socket connection on handshake', async () => {
      const mockClient = {
        handshake: { headers: { authorization: 'Bearer valid-jwt' } },
      } as unknown as Socket;

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'u-root-banned',
        email: 'rootbanned@example.com',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-root-banned',
        isActive: true,
        isRootBanned: true,
        rootBanReason: 'Malware distribution',
        profiles: [{ id: 'p-1' }],
      });

      await expect(socketAuthService.authenticate(mockClient)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects profile-banned socket connection on handshake', async () => {
      const mockClient = {
        handshake: { headers: { authorization: 'Bearer valid-jwt' } },
      } as unknown as Socket;

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'u-prof-banned',
        email: 'profbanned@example.com',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-prof-banned',
        isActive: true,
        isRootBanned: false,
        profiles: [{ id: 'p-1', isAccountBanned: true }],
      });

      await expect(socketAuthService.authenticate(mockClient)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Realtime Active Session Disconnection (AppGateway)', () => {
    it('actively disconnects live sockets when user.session.terminate is emitted', () => {
      const mockDisconnect = vi.fn();
      const mockEmit = vi.fn();
      const clientSocket = {
        disconnect: mockDisconnect,
        emit: mockEmit,
        data: {
          user: { sub: 'target-user', profileId: 'target-profile' },
        },
      } as unknown as SocketWithAuth;

      const mockServer = {
        sockets: new Map([['socket-1', clientSocket]]),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
        in: vi.fn().mockReturnValue({ disconnectSockets: vi.fn() }),
      };

      const gateway = new AppGateway(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      gateway.server = mockServer as any;

      gateway.handleUserSessionTerminate({
        userId: 'target-user',
        profileId: 'target-profile',
        reason: 'Account banned by administration',
      });

      expect(mockEmit).toHaveBeenCalledWith('session_terminated', {
        reason: 'Account banned by administration',
      });
      expect(mockDisconnect).toHaveBeenCalledWith(true);
    });
  });
});
