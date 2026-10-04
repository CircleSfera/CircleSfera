// In-memory stand-in for the ioredis commands the spam protection uses, for
// unit tests. Expiry is tracked against Date.now(), so fake timers apply.
type Entry = { value: string | Set<string>; expiresAt: number | null };

export class FakeRedis {
  private readonly store = new Map<string, Entry>();
  failing = false;

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (entry?.expiresAt !== null && entry && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  private check(): void {
    if (this.failing) throw new Error('redis down');
  }

  keys(): string[] {
    return [...this.store.keys()].filter((k) => this.live(k));
  }

  async incr(key: string): Promise<number> {
    this.check();
    return this.incrBy(key, 1);
  }

  async incrby(key: string, by: number): Promise<number> {
    this.check();
    return this.incrBy(key, by);
  }

  async decrby(key: string, by: number): Promise<number> {
    this.check();
    return this.incrBy(key, -by);
  }

  async decr(key: string): Promise<number> {
    this.check();
    return this.incrBy(key, -1);
  }

  private incrBy(key: string, by: number): number {
    const entry = this.live(key);
    const next = Number(entry?.value ?? 0) + by;
    this.store.set(key, {
      value: String(next),
      expiresAt: entry?.expiresAt ?? null,
    });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.check();
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async get(key: string): Promise<string | null> {
    this.check();
    const entry = this.live(key);
    return typeof entry?.value === 'string' ? entry.value : null;
  }

  async set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<'OK' | null> {
    this.check();
    let expiresAt: number | null = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'EX') expiresAt = Date.now() + Number(args[i + 1]) * 1000;
      if (args[i] === 'PX') expiresAt = Date.now() + Number(args[i + 1]);
    }
    if (args.includes('NX') && this.live(key)) return null;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    this.check();
    return this.store.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    this.check();
    return this.live(key) ? 1 : 0;
  }

  async sadd(key: string, member: string): Promise<number> {
    this.check();
    const entry = this.live(key);
    const set = entry?.value instanceof Set ? entry.value : new Set<string>();
    const added = set.has(member) ? 0 : 1;
    set.add(member);
    this.store.set(key, { value: set, expiresAt: entry?.expiresAt ?? null });
    return added;
  }

  async scard(key: string): Promise<number> {
    this.check();
    const entry = this.live(key);
    return entry?.value instanceof Set ? entry.value.size : 0;
  }

  async smembers(key: string): Promise<string[]> {
    this.check();
    const entry = this.live(key);
    return entry?.value instanceof Set ? [...entry.value] : [];
  }

  multi() {
    const ops: Array<() => Promise<unknown>> = [];
    const queue = (op: () => Promise<unknown>) => {
      ops.push(op);
      return chain;
    };
    const chain = {
      incr: (k: string) => queue(() => this.incr(k)),
      incrby: (k: string, n: number) => queue(() => this.incrby(k, n)),
      expire: (k: string, s: number) => queue(() => this.expire(k, s)),
      sadd: (k: string, m: string) => queue(() => this.sadd(k, m)),
      scard: (k: string) => queue(() => this.scard(k)),
      exec: async (): Promise<[Error | null, unknown][]> => {
        this.check();
        const out: [Error | null, unknown][] = [];
        for (const op of ops) out.push([null, await op()]);
        return out;
      },
    };
    return chain;
  }
}
