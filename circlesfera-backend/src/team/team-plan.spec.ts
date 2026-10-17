import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followTeamPlan, hasTeamPlan } from './team-plan.js';

describe('the team follows the Business plan', () => {
  const prisma = {
    profile: { findUnique: vi.fn() },
    profileMember: { updateMany: vi.fn() },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.profileMember.updateMany.mockResolvedValue({ count: 3 });
  });

  it('a team needs a Business Profile on the Business plan', () => {
    expect(
      hasTeamPlan({ accountType: 'BUSINESS', verificationLevel: 'BUSINESS' }),
    ).toBe(true);
    expect(
      hasTeamPlan({ accountType: 'BUSINESS', verificationLevel: 'ELITE' }),
    ).toBe(false);
    expect(
      hasTeamPlan({ accountType: 'CREATOR', verificationLevel: 'BUSINESS' }),
    ).toBe(false);
    expect(hasTeamPlan(null)).toBe(false);
  });

  it('pauses the active members when the plan ends, without removing anyone', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      accountType: 'BUSINESS',
      verificationLevel: 'BASIC',
    });
    await expect(followTeamPlan(prisma as never, 'p-shop')).resolves.toBe(3);
    expect(prisma.profileMember.updateMany).toHaveBeenCalledWith({
      where: { profileId: 'p-shop', status: 'ACTIVE' },
      data: { status: 'PAUSED' },
    });
  });

  it('pauses them when the Profile stops being a Business Profile', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      accountType: 'PERSONAL',
      verificationLevel: 'BUSINESS',
    });
    await followTeamPlan(prisma as never, 'p-shop');
    expect(prisma.profileMember.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PAUSED' } }),
    );
  });

  it('makes the paused members active again when the plan returns', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      accountType: 'BUSINESS',
      verificationLevel: 'BUSINESS',
    });
    await followTeamPlan(prisma as never, 'p-shop');
    expect(prisma.profileMember.updateMany).toHaveBeenCalledWith({
      where: { profileId: 'p-shop', status: 'PAUSED' },
      data: { status: 'ACTIVE' },
    });
  });

  it('does nothing for a Profile that is gone', async () => {
    prisma.profile.findUnique.mockResolvedValue(null);
    await expect(followTeamPlan(prisma as never, 'p-gone')).resolves.toBe(0);
    expect(prisma.profileMember.updateMany).not.toHaveBeenCalled();
  });
});
