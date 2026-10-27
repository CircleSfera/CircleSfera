import { PrismaPg } from '@prisma/adapter-pg';

type PgAdapter = Awaited<ReturnType<PrismaPg['connect']>>;
type PgTransaction = Awaited<ReturnType<PgAdapter['startTransaction']>>;

/**
 * Makes the queries of one transaction run one after another.
 *
 * A transaction holds a single database connection. Prisma sends some queries
 * of a transaction at the same time: a read or write that returns two or more
 * relations (`include: { profile: …, media: … }`) loads each relation with its
 * own query, all at once. The `pg` client only queues them today, warns that
 * it does, and stops accepting them in its next major version. Here each query
 * waits for the one before it to finish, which is the order `pg` runs them in
 * today, so the result is the same.
 */
export function runTransactionQueriesInTurn(tx: PgTransaction): PgTransaction {
  let previous: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(run: () => Promise<T>): Promise<T> => {
    const current = previous.then(run);
    // A failed query fails only its caller; the next one still runs.
    previous = current.catch(() => undefined);
    return current;
  };

  const queryRaw = tx.queryRaw.bind(tx);
  const executeRaw = tx.executeRaw.bind(tx);
  tx.queryRaw = (query) => inTurn(() => queryRaw(query));
  tx.executeRaw = (query) => inTurn(() => executeRaw(query));
  return tx;
}

/**
 * The Postgres adapter of the app, whose transactions run their queries one
 * at a time. Queries outside a transaction are unchanged: the pool gives each
 * its own connection.
 */
export class SerialTransactionPrismaPg extends PrismaPg {
  override async connect(): Promise<PgAdapter> {
    const adapter = await super.connect();
    const startTransaction = adapter.startTransaction.bind(adapter);
    adapter.startTransaction = async (isolationLevel) =>
      runTransactionQueriesInTurn(await startTransaction(isolationLevel));
    return adapter;
  }
}
