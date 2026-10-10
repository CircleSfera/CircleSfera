import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

// The message the queue gave when it refused the id of a job. Only events
// that failed for this reason are touched: any other failure is left as it
// is, to be looked at.
const REFUSED_ID = 'Custom Id cannot contain';

// Outbox events that failed for good because the queue refused the id of
// their job are put back to be published: data exports people asked for and
// clean-ups of the media of deleted content. The publisher now gives them an
// id the queue accepts.
//
// It prints how many there are, by kind, and changes nothing unless APPLY=1.
// It prints counts and dates only, never what an event carries. Safe to run
// again: an event put back is no longer failed. Runs with plain Node inside
// the production image, through the "Ops — requeue failed outbox events"
// workflow.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const apply = process.env.APPLY === '1';

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const refused = {
      status: 'FAILED',
      lastError: { contains: REFUSED_ID },
    };

    const kinds = await prisma.outboxEvent.groupBy({
      by: ['queueName', 'eventName'],
      where: refused,
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
      orderBy: [{ queueName: 'asc' }, { eventName: 'asc' }],
    });

    let total = 0;
    for (const kind of kinds) {
      total += kind._count._all;
      console.log(
        `${apply ? 'REQUEUE' : 'WOULD REQUEUE'} ${kind.queueName}/${kind.eventName}: ` +
          `${kind._count._all} (from ${kind._min.createdAt?.toISOString()} ` +
          `to ${kind._max.createdAt?.toISOString()})`,
      );
    }

    const otherFailures = await prisma.outboxEvent.count({
      where: { status: 'FAILED', NOT: { lastError: { contains: REFUSED_ID } } },
    });
    const stillRetrying = await prisma.outboxEvent.count({
      where: { status: 'PENDING', lastError: { contains: REFUSED_ID } },
    });
    console.log(`Failed for this reason: ${total}`);
    console.log(
      `Failed for another reason, left as they are: ${otherFailures}`,
    );
    console.log(
      `Still being retried, published by themselves: ${stillRetrying}`,
    );

    if (apply && total > 0) {
      const changed = await prisma.outboxEvent.updateMany({
        where: refused,
        data: { status: 'PENDING', retryCount: 0, lastError: null },
      });
      console.log(`Put back to be published: ${changed.count}`);
    }
    console.log(apply ? 'Applied.' : 'Dry run: nothing was changed.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
