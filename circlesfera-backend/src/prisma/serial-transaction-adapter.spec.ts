import { PrismaPg } from '@prisma/adapter-pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  runTransactionQueriesInTurn,
  SerialTransactionPrismaPg,
} from './serial-transaction-adapter.js';

type Tx = Parameters<typeof runTransactionQueriesInTurn>[0];
type Query = Parameters<Tx['queryRaw']>[0];

const query = (sql: string): Query => ({ sql, args: [], argTypes: [] });

/**
 * A transaction whose queries finish only when the test says so, and which
 * records how many of them were running at the same time.
 */
function fakeTransaction() {
  let running = 0;
  let mostAtOnce = 0;
  const started: string[] = [];
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  const run = (q: Query) => {
    running += 1;
    mostAtOnce = Math.max(mostAtOnce, running);
    started.push(q.sql);
    return new Promise((resolve, reject) => {
      pending.set(q.sql, { resolve, reject });
    }).finally(() => {
      running -= 1;
    });
  };
  const tx = {
    queryRaw: vi.fn(run),
    executeRaw: vi.fn(run),
  } as unknown as Tx;
  return {
    tx,
    started,
    mostAtOnce: () => mostAtOnce,
    finish: (sql: string, value: unknown) => pending.get(sql)?.resolve(value),
    fail: (sql: string, error: Error) => pending.get(sql)?.reject(error),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('runTransactionQueriesInTurn', () => {
  it('sends the next query only after the one before it has finished', async () => {
    const fake = fakeTransaction();
    const tx = runTransactionQueriesInTurn(fake.tx);

    const first = tx.queryRaw(query('first'));
    const second = tx.executeRaw(query('second'));
    const third = tx.queryRaw(query('third'));
    await flush();
    expect(fake.started).toEqual(['first']);

    fake.finish('first', { rows: ['a'] });
    await flush();
    expect(fake.started).toEqual(['first', 'second']);

    fake.finish('second', 2);
    await flush();
    fake.finish('third', { rows: ['c'] });

    await expect(first).resolves.toEqual({ rows: ['a'] });
    await expect(second).resolves.toBe(2);
    await expect(third).resolves.toEqual({ rows: ['c'] });
    expect(fake.started).toEqual(['first', 'second', 'third']);
    expect(fake.mostAtOnce()).toBe(1);
  });

  it('fails only the query that failed, and still runs the next one', async () => {
    const fake = fakeTransaction();
    const tx = runTransactionQueriesInTurn(fake.tx);

    const failing = tx.executeRaw(query('failing'));
    const next = tx.queryRaw(query('next'));
    await flush();
    fake.fail('failing', new Error('unique constraint'));
    await expect(failing).rejects.toThrow('unique constraint');

    await flush();
    expect(fake.started).toEqual(['failing', 'next']);
    fake.finish('next', { rows: [] });
    await expect(next).resolves.toEqual({ rows: [] });
  });
});

describe('SerialTransactionPrismaPg', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the queries of every transaction it starts one at a time', async () => {
    const fake = fakeTransaction();
    const startTransaction = vi.fn().mockResolvedValue(fake.tx);
    const adapter = { startTransaction };
    vi.spyOn(PrismaPg.prototype, 'connect').mockResolvedValue(
      adapter as unknown as Awaited<ReturnType<PrismaPg['connect']>>,
    );

    const connected = await new SerialTransactionPrismaPg(
      'postgresql://test:test@localhost:5432/test',
    ).connect();
    const tx = await connected.startTransaction('SERIALIZABLE');

    expect(connected).toBe(adapter);
    expect(startTransaction).toHaveBeenCalledWith('SERIALIZABLE');
    const first = tx.queryRaw(query('first'));
    const second = tx.queryRaw(query('second'));
    await flush();
    expect(fake.started).toEqual(['first']);
    fake.finish('first', { rows: [] });
    await flush();
    fake.finish('second', { rows: [] });
    await Promise.all([first, second]);
    expect(fake.mostAtOnce()).toBe(1);
  });
});
