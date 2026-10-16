import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminLinkDomainsController } from './admin-link-domains.controller.js';
import {
  AdminLinkDomainsService,
  normaliseDomain,
} from './admin-link-domains.service.js';
import type { LogAdminActionUseCase } from './use-cases/content/commands/log-admin-action.use-case.js';

function setup() {
  const prisma = {
    blockedLinkDomain: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => ({ id: 'd-1', ...data })),
      delete: vi.fn(),
    },
  };
  const log = { execute: vi.fn() };
  const service = new AdminLinkDomainsService(
    prisma as unknown as PrismaService,
    log as unknown as LogAdminActionUseCase,
  );
  return { prisma, log, service };
}

describe('the domains staff block for links', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('are written as a link’s host, from a domain or a pasted address', () => {
    expect(normaliseDomain(' Shop.Example.COM ')).toBe('shop.example.com');
    expect(normaliseDomain('https://evil.example/path?x')).toBe('evil.example');
    expect(normaliseDomain('bücher.de.')).toBe('xn--bcher-kva.de');
    for (const bad of ['localhost', '10.0.0.1', 'https://[::1]', 'http://']) {
      expect(() => normaliseDomain(bad)).toThrow('DOMAIN_INVALID');
    }
  });

  it('are added once, with who added them and why, and the change is audited', async () => {
    await s.service.block('admin-1', 'Evil.example', ' phishing ');

    expect(s.prisma.blockedLinkDomain.create).toHaveBeenCalledWith({
      data: {
        domain: 'evil.example',
        reason: 'phishing',
        createdByAdminId: 'admin-1',
      },
    });
    expect(s.log.execute).toHaveBeenCalledWith(
      'admin-1',
      'LINK_DOMAIN_BLOCKED',
      'link_domain',
      'd-1',
      'evil.example: phishing',
    );

    s.prisma.blockedLinkDomain.findUnique.mockResolvedValueOnce({ id: 'd-1' });
    await expect(s.service.block('admin-1', 'evil.example')).rejects.toThrow(
      'DOMAIN_ALREADY_BLOCKED',
    );
  });

  it('keep no empty reason', async () => {
    await s.service.block('admin-1', 'evil.example', '  ');

    expect(s.prisma.blockedLinkDomain.create.mock.calls[0][0].data.reason).toBe(
      null,
    );
    expect(s.log.execute.mock.calls[0][4]).toBe('evil.example');
  });

  it('are taken off, audited, and a missing one says so', async () => {
    s.prisma.blockedLinkDomain.findUnique.mockResolvedValueOnce({
      id: 'd-1',
      domain: 'evil.example',
    });
    await expect(s.service.unblock('admin-1', 'd-1')).resolves.toEqual({
      id: 'd-1',
      domain: 'evil.example',
    });
    expect(s.prisma.blockedLinkDomain.delete).toHaveBeenCalledWith({
      where: { id: 'd-1' },
    });
    expect(s.log.execute).toHaveBeenCalledWith(
      'admin-1',
      'LINK_DOMAIN_UNBLOCKED',
      'link_domain',
      'd-1',
      'evil.example',
    );

    await expect(s.service.unblock('admin-1', 'nope')).rejects.toThrow(
      'not found',
    );
  });

  it('are listed in order, and found by a part of their name', async () => {
    await s.service.list();
    expect(s.prisma.blockedLinkDomain.findMany.mock.calls[0][0].where).toBe(
      undefined,
    );

    await s.service.list(' EVIL ');
    expect(s.prisma.blockedLinkDomain.findMany.mock.calls[1][0]).toMatchObject({
      where: { domain: { contains: 'evil' } },
      orderBy: { domain: 'asc' },
    });
  });

  it('are reached through staff routes that pass the staff member on', async () => {
    const service = {
      list: vi.fn(),
      block: vi.fn(),
      unblock: vi.fn(),
    };
    const controller = new AdminLinkDomainsController(service as never);
    const admin = { adminId: 'admin-1' } as never;

    controller.list('ev');
    controller.block({ domain: 'evil.example', reason: 'x' }, admin);
    controller.unblock('d-1', admin);

    expect(service.list).toHaveBeenCalledWith('ev');
    expect(service.block).toHaveBeenCalledWith('admin-1', 'evil.example', 'x');
    expect(service.unblock).toHaveBeenCalledWith('admin-1', 'd-1');
  });
});
