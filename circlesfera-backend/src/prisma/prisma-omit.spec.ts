import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { CLIENT_OMIT } from './prisma.service.js';

// A pool that answers every query with no rows and keeps the SQL it was sent:
// the real Prisma client builds the queries, no database is needed.
class RecordingPool extends pg.Pool {
  readonly sql: string[] = [];
  // pg's query has many overloads; only the config form is sent here.
  override query(config: any): any {
    this.sql.push(typeof config === 'string' ? config : config.text);
    return Promise.resolve({ fields: [], rows: [], rowCount: 0 });
  }
}

const pool = new RecordingPool();
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
  omit: CLIENT_OMIT,
});

async function sqlOf(read: () => Promise<unknown>): Promise<string> {
  pool.sql.length = 0;
  await read();
  return pool.sql.join('\n');
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the reads of a post, through the real Prisma client', () => {
  it("leave out the post's topic by default, also inside a relation", async () => {
    const direct = await sqlOf(() =>
      prisma.post.findMany({ where: { id: 'p1' } }),
    );
    expect(direct).toContain('"caption"');
    expect(direct).not.toContain('"topic"');

    const nested = await sqlOf(() =>
      prisma.profile.findMany({
        where: { id: 'pr1' },
        include: { posts: true },
      }),
    );
    expect(nested).toContain('"caption"');
    expect(nested).not.toContain('"topic"');
  });

  it('carry it only where it is asked for by name', async () => {
    const selected = await sqlOf(() =>
      prisma.post.findMany({ where: { id: 'p1' }, select: { topic: true } }),
    );
    expect(selected).toContain('"topic"');

    const optedIn = await sqlOf(() =>
      prisma.post.findMany({ where: { id: 'p1' }, omit: { topic: false } }),
    );
    expect(optedIn).toContain('"topic"');
  });
});
