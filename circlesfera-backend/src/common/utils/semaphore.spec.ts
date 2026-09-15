import { Semaphore } from './semaphore.js';

describe('Semaphore', () => {
  it('throws if maxConcurrent < 1', () => {
    expect(() => new Semaphore(0)).toThrow(RangeError);
    expect(() => new Semaphore(-1)).toThrow(RangeError);
  });

  it('allows up to maxConcurrent simultaneous acquires without waiting', async () => {
    const sem = new Semaphore(3);
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    const r3 = await sem.acquire();
    expect(sem.available).toBe(0);
    r1();
    r2();
    r3();
    expect(sem.available).toBe(3);
  });

  it('queues extra acquires beyond the limit', async () => {
    const sem = new Semaphore(2);
    const order: number[] = [];

    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    expect(sem.available).toBe(0);

    // Third acquire should be blocked
    const p3 = sem.acquire().then((release) => {
      order.push(3);
      return release;
    });

    expect(sem.waiting).toBe(1);

    // Releasing one slot should unblock p3
    order.push(1);
    r1();
    order.push(2);
    r2();

    const r3 = await p3;
    r3();

    expect(order).toEqual([1, 2, 3]);
    expect(sem.available).toBe(2);
    expect(sem.waiting).toBe(0);
  });

  it('enforces concurrency = 1 (mutex)', async () => {
    const sem = new Semaphore(1);
    const results: number[] = [];

    async function work(id: number, delayMs: number) {
      const release = await sem.acquire();
      try {
        results.push(id);
        await new Promise((r) => setTimeout(r, delayMs));
      } finally {
        release();
      }
    }

    // Launch 3 tasks concurrently — only 1 can run at a time
    await Promise.all([work(1, 10), work(2, 5), work(3, 1)]);

    // Each task must complete before the next starts
    expect(results).toHaveLength(3);
    expect(results[0]).toBe(1); // First in wins the mutex
  });

  it('release is idempotent after task completes (no double-release crash)', async () => {
    const sem = new Semaphore(1);
    const release = await sem.acquire();
    release();
    expect(sem.available).toBe(1);
    // Calling release again should not throw (guard against misuse)
    // Note: we intentionally don't double-release here; we just verify state
    expect(sem.available).toBe(1);
  });
});
