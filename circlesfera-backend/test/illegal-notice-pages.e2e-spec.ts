import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { IllegalNoticeStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { IllegalNoticesService } from '../src/illegal-notices/illegal-notices.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { uniqueSuffix } from './utils/unique-id.js';

// Staff read each tab of the notices a page at a time, most recent first, so
// every notice can be reached however many there are. Waiting notices of
// child sexual abuse material come before every other waiting notice; a
// decided tab follows the order of the decisions.
describe('Illegal content notice pages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notices: IllegalNoticesService;
  const marker = `https://circlesfera.com/p/notice-pages-${uniqueSuffix()}`;
  const ids: string[] = [];

  const at = (hour: number) => new Date(Date.UTC(2026, 9, 18, hour));

  const make = async (
    label: string,
    data: {
      status: IllegalNoticeStatus;
      childAbuse?: boolean;
      createdAt: Date;
      decidedAt?: Date;
    },
  ) => {
    const notice = await prisma.illegalContentNotice.create({
      data: {
        contentUrl: `${marker}/${label}`,
        explanation: 'Notice pages test',
        goodFaith: true,
        locale: 'en',
        childAbuse: data.childAbuse ?? false,
        status: data.status,
        createdAt: data.createdAt,
        decidedAt: data.decidedAt ?? null,
      },
      select: { id: true },
    });
    ids.push(notice.id);
  };

  // Every page of a tab in turn until the last, two at a time, keeping only
  // this test's notices.
  const walk = async (status: IllegalNoticeStatus) => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await notices.listPage(status, cursor, 2);
      seen.push(
        ...page.items
          .filter((n) => n.contentUrl.startsWith(marker))
          .map((n) => n.contentUrl.slice(marker.length + 1)),
      );
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 50);
    return seen;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    notices = app.get(IllegalNoticesService);

    const { RECEIVED, ACTIONED, NO_ACTION } = IllegalNoticeStatus;
    // Waiting: two of child abuse, three others, two of them received at the
    // same moment.
    await make('waiting-old', { status: RECEIVED, createdAt: at(8) });
    await make('waiting-tie-a', { status: RECEIVED, createdAt: at(10) });
    await make('waiting-tie-b', { status: RECEIVED, createdAt: at(10) });
    await make('abuse-old', {
      status: RECEIVED,
      childAbuse: true,
      createdAt: at(7),
    });
    await make('abuse-new', {
      status: RECEIVED,
      childAbuse: true,
      createdAt: at(9),
    });
    // Decided: received in one order, decided in another.
    await make('decided-first', {
      status: ACTIONED,
      createdAt: at(11),
      decidedAt: at(12),
    });
    await make('decided-last', {
      status: ACTIONED,
      createdAt: at(5),
      decidedAt: at(14),
    });
    await make('decided-middle', {
      status: ACTIONED,
      createdAt: at(6),
      decidedAt: at(13),
    });
    await make('no-action', {
      status: NO_ACTION,
      createdAt: at(4),
      decidedAt: at(15),
    });
  });

  afterAll(async () => {
    await prisma.illegalContentNotice.deleteMany({
      where: { id: { in: ids } },
    });
    await app.close();
  });

  it('gives every waiting notice once: child abuse first, then the most recent', async () => {
    const seen = await walk(IllegalNoticeStatus.RECEIVED);

    const tie = ids.slice(1, 3);
    const tieOrder =
      tie[0] > tie[1]
        ? ['waiting-tie-a', 'waiting-tie-b']
        : ['waiting-tie-b', 'waiting-tie-a'];
    expect(seen).toEqual([
      'abuse-new',
      'abuse-old',
      ...tieOrder,
      'waiting-old',
    ]);
  });

  it('gives a decided tab in the order of the decisions, the latest first', async () => {
    expect(await walk(IllegalNoticeStatus.ACTIONED)).toEqual([
      'decided-last',
      'decided-middle',
      'decided-first',
    ]);
    expect(await walk(IllegalNoticeStatus.NO_ACTION)).toEqual(['no-action']);
  });

  it('starts from the top when the cursor is not one it gave', async () => {
    const first = await notices.listPage(
      IllegalNoticeStatus.ACTIONED,
      undefined,
      50,
    );
    const again = await notices.listPage(
      IllegalNoticeStatus.ACTIONED,
      'not-a-cursor',
      50,
    );

    expect(again.items.map((n) => n.id)).toEqual(first.items.map((n) => n.id));
    expect(first.nextCursor).toBeNull();
  });
});
