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

import { PrismaService } from './prisma.service.js';

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
});
