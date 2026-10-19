import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdminLinkDomainsService } from '../src/admin/admin-link-domains.service.js';
import { AdminUsersService } from '../src/admin/admin-users.service.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createUserWithProfile } from './factories/index.js';
import { uniqueSuffix } from './utils/unique-id.js';

// Staff read the notes on an account and the blocked link domains a page at
// a time, so every note and every domain can be reached however many there
// are: walking the pages gives each once, notes newest first and domains in
// alphabetical order.
describe('Staff list pages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: AdminUsersService;
  let domains: AdminLinkDomainsService;
  let userId: string;
  const id = uniqueSuffix()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const marker = `pages${id}`;
  const domainNames = ['e', 'a', 'c', 'b', 'd'].map(
    (l) => `${l}-${marker}.example`,
  );
  // The order the notes were written: the third and fourth at one moment.
  const noteTimes = [
    '2026-10-18T09:00:00.000Z',
    '2026-10-18T10:00:00.000Z',
    '2026-10-18T11:00:00.000Z',
    '2026-10-18T11:00:00.000Z',
    '2026-10-18T12:00:00.000Z',
  ];
  const expectedNotes: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    users = app.get(AdminUsersService);
    domains = app.get(AdminLinkDomainsService);

    const account = await createUserWithProfile(prisma);
    userId = account.user.id;
    const made: { id: string; at: string }[] = [];
    for (const [i, at] of noteTimes.entries()) {
      const note = await prisma.staffNote.create({
        data: { userId, body: `Note ${i}`, createdAt: new Date(at) },
        select: { id: true },
      });
      made.push({ id: note.id, at });
    }
    expectedNotes.push(
      ...made
        .sort((a, b) =>
          a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1,
        )
        .map((n) => n.id),
    );

    await prisma.blockedLinkDomain.createMany({
      data: domainNames.map((domain) => ({ domain })),
    });
  });

  afterAll(async () => {
    await prisma.blockedLinkDomain.deleteMany({
      where: { domain: { in: domainNames } },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('gives every note on an account once, newest first, two to a page', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await users.getStaffNotesPage(userId, cursor, 2);
      seen.push(...page.items.map((n) => n.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);

    expect(seen).toEqual(expectedNotes);
    expect(pages).toBe(3);
  });

  it('gives every blocked domain that matches once, in alphabetical order, two to a page', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await domains.listPage(marker.toUpperCase(), cursor, 2);
      seen.push(...page.items.map((d) => d.domain));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);

    expect(seen).toEqual([...domainNames].sort());
    expect(pages).toBe(3);
  });

  it('says the last page is the last one', async () => {
    const notes = await users.getStaffNotesPage(userId, undefined, 50);
    const blocked = await domains.listPage(marker, undefined, 50);

    expect(notes.items).toHaveLength(noteTimes.length);
    expect(notes.nextCursor).toBeNull();
    expect(blocked.items).toHaveLength(domainNames.length);
    expect(blocked.nextCursor).toBeNull();
  });
});
