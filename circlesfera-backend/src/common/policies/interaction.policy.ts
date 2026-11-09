import type { InteractionAudience, Prisma } from '@prisma/client';

// Who may mention or tag a Profile: everyone, the Profiles it follows, or
// nobody. A mention or tag from someone not allowed is left out silently;
// neither side is told.

type InteractionReader = Pick<Prisma.TransactionClient, 'profile' | 'follow'>;

type Interaction = 'mention' | 'tag';

const FIELD = {
  mention: 'mentionsFrom',
  tag: 'tagsFrom',
} as const satisfies Record<Interaction, string>;

// Of `targetIds`, those that let `actorId` mention (or tag) them, with
// whether each asks to approve tags by hand. A Profile always may mention
// or tag itself.
export async function allowedTargets(
  db: InteractionReader,
  actorId: string,
  targetIds: string[],
  kind: Interaction,
): Promise<Map<string, { manualTagApproval: boolean }>> {
  const ids = [...new Set(targetIds)];
  if (ids.length === 0) return new Map();
  const field = FIELD[kind];
  const targets = (await db.profile.findMany({
    where: { id: { in: ids } },
    select: { id: true, [field]: true, manualTagApproval: true },
  })) as unknown as ({
    id: string;
    manualTagApproval: boolean;
  } & Record<(typeof FIELD)[Interaction], InteractionAudience | undefined>)[];

  const needFollow = targets
    .filter((t) => t.id !== actorId && t[field] === 'FOLLOWING')
    .map((t) => t.id);
  const following = needFollow.length
    ? new Set(
        (
          await db.follow.findMany({
            where: {
              followerId: { in: needFollow },
              followingId: actorId,
              status: 'ACCEPTED',
            },
            select: { followerId: true },
          })
        ).map((f) => f.followerId),
      )
    : new Set<string>();

  const allowed = new Map<string, { manualTagApproval: boolean }>();
  for (const t of targets) {
    const audience = t[field] ?? 'EVERYONE';
    const ok =
      t.id === actorId ||
      audience === 'EVERYONE' ||
      (audience === 'FOLLOWING' && following.has(t.id));
    if (ok) {
      allowed.set(t.id, {
        manualTagApproval: t.id !== actorId && t.manualTagApproval,
      });
    }
  }
  return allowed;
}
