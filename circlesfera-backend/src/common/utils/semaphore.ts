/**
 * A minimal async semaphore for bounding in-process concurrency.
 *
 * Usage:
 *   const sem = new Semaphore(4);
 *   const release = await sem.acquire();
 *   try { await heavyWork(); } finally { release(); }
 */
export class Semaphore {
  private slots: number;
  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    if (maxConcurrent < 1) {
      throw new RangeError(
        `Semaphore maxConcurrent must be >= 1, got ${maxConcurrent}`,
      );
    }
    this.slots = maxConcurrent;
  }

  /**
   * Acquires a slot, waiting if all slots are taken.
   * Returns a `release` function — call it in a `finally` block.
   */
  acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        if (this.slots > 0) {
          this.slots--;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release(): void {
    this.slots++;
    const next = this.queue.shift();
    if (next) next();
  }

  /** Current number of available slots (for observability). */
  get available(): number {
    return this.slots;
  }

  /** Current number of waiters (for observability). */
  get waiting(): number {
    return this.queue.length;
  }
}
