import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { ProfileMemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { type ProfileAction, roleAllows } from './profile-actions.js';

// How a person relates to a Profile: its owner, an active member with a
// role, or nobody.
export type ProfileRelation =
  | { kind: 'owner' }
  | { kind: 'member'; role: ProfileMemberRole }
  | { kind: 'none' };

// The one place that answers whether a person can do an action on a
// Profile (ADR-0028). The owner is the person whose account holds the
// Profile; a member counts only while active.
@Injectable()
export class ProfileAccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async relation(userId: string, profileId: string): Promise<ProfileRelation> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        userId: true,
        members: {
          where: { userId, status: 'ACTIVE' },
          select: { role: true },
          take: 1,
        },
      },
    });
    if (!profile) return { kind: 'none' };
    if (profile.userId === userId) return { kind: 'owner' };
    const member = profile.members[0];
    return member ? { kind: 'member', role: member.role } : { kind: 'none' };
  }

  async can(
    userId: string,
    profileId: string,
    action: ProfileAction,
  ): Promise<boolean> {
    const relation = await this.relation(userId, profileId);
    if (relation.kind === 'owner') return true;
    if (relation.kind === 'member') return roleAllows(relation.role, action);
    return false;
  }

  async assertCan(
    userId: string,
    profileId: string,
    action: ProfileAction,
  ): Promise<void> {
    if (!(await this.can(userId, profileId, action))) {
      throw new ForbiddenException('Not allowed on this profile');
    }
  }
}
