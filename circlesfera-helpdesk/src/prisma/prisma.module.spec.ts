import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { helpdeskDatabaseUrl, PrismaModule } from './prisma.module.js';
import { PrismaService } from './prisma.service.js';

describe('the Help Desk database', () => {
  it('is read from HELPDESK_DATABASE_URL only', () => {
    expect(
      helpdeskDatabaseUrl({
        HELPDESK_DATABASE_URL: 'postgresql://helpdesk@localhost/helpdesk',
      }),
    ).toBe('postgresql://helpdesk@localhost/helpdesk');
  });

  it("stops the start rather than fall back to CircleSfera's DATABASE_URL", () => {
    expect(() =>
      helpdeskDatabaseUrl({
        DATABASE_URL: 'postgresql://circlesfera@localhost/circlesfera',
      }),
    ).toThrow('HELPDESK_DATABASE_URL is not defined');
  });

  it('gives the app a client built from that address', async () => {
    vi.stubEnv('HELPDESK_DATABASE_URL', 'postgresql://nobody@127.0.0.1:1/none');
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [PrismaModule],
      }).compile();

      // Prisma's constructor returns a proxy of the client, which neither
      // `instanceof` nor the matchers can look into: its methods are checked.
      const client = moduleRef.get(PrismaService);
      expect(typeof client.$queryRaw).toBe('function');
      expect(typeof client.onModuleInit).toBe('function');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('connects when the module starts and disconnects when it stops', async () => {
    // Nothing is opened until $connect: the address may point nowhere.
    const prisma = new PrismaService('postgresql://nobody@127.0.0.1:1/none');
    const connect = vi.spyOn(prisma, '$connect').mockResolvedValue();
    const disconnect = vi.spyOn(prisma, '$disconnect').mockResolvedValue();

    await prisma.onModuleInit();
    await prisma.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
