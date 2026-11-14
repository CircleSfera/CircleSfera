import { describe, expect, it, vi } from 'vitest';

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class MockPrismaClient {
      constructor(public options: any) {}
      $connect = mockConnect;
      $disconnect = mockDisconnect;
    },
  };
});

vi.mock('@prisma/adapter-pg', () => {
  return {
    PrismaPg: class MockPrismaPg {
      constructor(public pool: any) {}
    },
  };
});

vi.mock('pg', () => {
  return {
    default: {
      Pool: class MockPool {
        constructor(public opts: any) {}
      },
    },
  };
});

import {
  PrismaService,
  RETIRED_COLUMNS_OMIT,
  USER_SECRET_OMIT,
} from './prisma.service.js';

describe('PrismaService', () => {
  it('instantiates adapter and manages connect/disconnect lifecycle', async () => {
    const service = new PrismaService(
      'postgresql://test:test@localhost:5432/test',
    );
    expect(service).toBeDefined();

    await service.onModuleInit();
    expect(mockConnect).toHaveBeenCalled();

    await service.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('omits credential and one-time-token columns from every User read by default', () => {
    const service = new PrismaService(
      'postgresql://test:test@localhost:5432/test',
    ) as unknown as { options: { omit: { user: Record<string, boolean> } } };

    expect(service.options.omit.user).toMatchObject(USER_SECRET_OMIT);
    expect(Object.keys(USER_SECRET_OMIT)).toEqual(['currentChallenge']);
    expect(Object.values(USER_SECRET_OMIT).every((v) => v === true)).toBe(true);
  });

  it('omits the secret columns and the retired payout hold from a User read', () => {
    const service = new PrismaService(
      'postgresql://test:test@localhost:5432/test',
    ) as unknown as { options: { omit: { user: Record<string, boolean> } } };

    expect(service.options.omit.user).toEqual({
      ...USER_SECRET_OMIT,
      payoutsHeldAt: true,
    });
    expect(service.options.omit.user).not.toHaveProperty(
      'stripeConnectAccountId',
    );
  });

  // The release that drops these columns can roll back to this one: no read
  // or write of this client names them.
  it('leaves every retired column out of the reads of its model', () => {
    const service = new PrismaService(
      'postgresql://test:test@localhost:5432/test',
    ) as unknown as {
      options: { omit: Record<string, Record<string, boolean>> };
    };

    for (const [model, columns] of Object.entries(RETIRED_COLUMNS_OMIT)) {
      expect(service.options.omit[model]).toMatchObject(columns);
    }
    expect(Object.keys(RETIRED_COLUMNS_OMIT.transaction)).toEqual([
      'receiverId',
      'receiverProfileId',
      'postId',
      'storyId',
      'messageId',
      'liveStreamId',
    ]);
  });
});
