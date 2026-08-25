export type LastActiveBucket = 'today' | 'week' | 'month' | 'older' | 'unknown';
export type AccountStanding = 'ok' | 'suspended';

export function lastActiveBucket(
  lastSeenAt: Date | string | null | undefined,
  now = new Date(),
): LastActiveBucket {
  if (!lastSeenAt) return 'unknown';
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return 'unknown';
  const diff = Math.max(0, now.getTime() - seen);
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return 'today';
  if (diff < 7 * day) return 'week';
  if (diff < 30 * day) return 'month';
  return 'older';
}

export function accountStanding(user: {
  isActive: boolean;
  suspendedUntil: Date | string | null;
  now?: Date;
}): AccountStanding {
  const now = user.now ?? new Date();
  if (
    user.suspendedUntil &&
    new Date(user.suspendedUntil).getTime() > now.getTime()
  ) {
    return 'suspended';
  }
  if (!user.isActive) return 'suspended';
  return 'ok';
}

export type TrustFactor = {
  key: string;
  delta: number;
  label: string;
};

export function computeTrustScore(input: {
  emailVerified: boolean;
  identityVerified: boolean;
  createdAt: Date | string;
  strikeCount: number;
  botLabeled: boolean;
  clusterSize: number;
  now?: Date;
}): { score: number; factors: TrustFactor[] } {
  const now = input.now ?? new Date();
  const ageDays = Math.max(
    0,
    (now.getTime() - new Date(input.createdAt).getTime()) / 86_400_000,
  );
  const factors: TrustFactor[] = [{ key: 'base', delta: 50, label: 'Base' }];

  if (input.emailVerified) {
    factors.push({
      key: 'email',
      delta: 15,
      label: 'Email confirmed',
    });
  }
  if (input.identityVerified) {
    factors.push({
      key: 'kyc',
      delta: 20,
      label: 'Identity verified',
    });
  }
  if (ageDays >= 30) {
    factors.push({
      key: 'age30',
      delta: 10,
      label: 'Account older than 30 days',
    });
  } else if (ageDays >= 7) {
    factors.push({ key: 'age7', delta: 5, label: 'Account older than 7 days' });
  }
  const strikePenalty = Math.min(40, Math.max(0, input.strikeCount) * 10);
  if (strikePenalty) {
    factors.push({
      key: 'strikes',
      delta: -strikePenalty,
      label: `Strikes (${input.strikeCount})`,
    });
  }
  if (input.botLabeled) {
    factors.push({
      key: 'bot_label',
      delta: -25,
      label: 'Staff bot label',
    });
  }
  if (input.clusterSize >= 3) {
    factors.push({
      key: 'cluster',
      delta: -15,
      label: `Shared device/IP cluster (${input.clusterSize})`,
    });
  }

  const raw = factors.reduce((sum, f) => sum + f.delta, 0);
  const score = Math.max(0, Math.min(100, raw));
  return { score, factors };
}
