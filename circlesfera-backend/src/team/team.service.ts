import { ErrorCode, type NotificationCreateEvent } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotificationType,
  type Prisma,
  type ProfileMemberRole,
} from '@prisma/client';
import { createPaginatedResult } from '../common/dto/pagination.dto.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfileAccessService } from './profile-access.service.js';

// At most this many members per Business Profile, besides its owner,
// counting those invited and those paused (PD-014).
export const TEAM_SEATS = 5;

// The states that hold a seat.
const SEAT_STATES = ['INVITED', 'ACTIVE', 'PAUSED'] as const;

// How a person is shown in a team: their first Profile.
const PERSON_SELECT = {
  profiles: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 1,
    select: { id: true, username: true, fullName: true, avatar: true },
  },
} satisfies Prisma.UserSelect;

// Team access to a Business Profile (ADR-0028, step 2): the owner invites
// and removes people; a person accepts or declines.
@Injectable()
export class TeamService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProfileAccessService)
    private readonly access: ProfileAccessService,
    private readonly events: EventEmitter2,
  ) {}

  // The team of the Profile in use, for its owner.
  async team(userId: string, profileId: string) {
    await this.access.assertCan(userId, profileId, 'team.manage');
    const [profile, members] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { id: profileId },
        select: { accountType: true, verificationLevel: true },
      }),
      this.prisma.profileMember.findMany({
        where: { profileId, status: { in: [...SEAT_STATES] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          status: true,
          createdAt: true,
          acceptedAt: true,
          user: { select: PERSON_SELECT },
        },
      }),
    ]);
    return {
      // A team needs a Business Profile on the Business plan.
      available:
        profile?.accountType === 'BUSINESS' &&
        profile.verificationLevel === 'BUSINESS',
      seats: { used: members.length, max: TEAM_SEATS },
      members: members.map(({ user, ...member }) => ({
        ...member,
        person: user.profiles[0] ?? null,
      })),
    };
  }

  // The owner invites a person, named by one of their usernames, with a
  // role. The seat count is checked under a lock on the Profile, so two
  // invitations at once cannot take the sixth seat.
  async invite(
    userId: string,
    profileId: string,
    input: { username: string; role: ProfileMemberRole },
  ) {
    await this.access.assertCan(userId, profileId, 'team.manage');

    const invitee = await this.prisma.profile.findFirst({
      where: { username: { equals: input.username, mode: 'insensitive' } },
      select: { userId: true },
    });
    if (!invitee) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'No profile with that username',
      );
    }
    if (invitee.userId === userId) {
      throw AppException.BadRequest(
        ErrorCode.TEAM_INVITE_SELF,
        'The owner is already in charge of the profile',
      );
    }

    const member = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${profileId} FOR UPDATE`;
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: { accountType: true, verificationLevel: true },
      });
      if (
        profile?.accountType !== 'BUSINESS' ||
        profile.verificationLevel !== 'BUSINESS'
      ) {
        throw AppException.Forbidden(
          ErrorCode.PLAN_REQUIRED,
          'A team is part of the Business plan.',
        );
      }

      const existing = await tx.profileMember.findUnique({
        where: { profileId_userId: { profileId, userId: invitee.userId } },
        select: { id: true, status: true },
      });
      if (
        existing &&
        (SEAT_STATES as readonly string[]).includes(existing.status)
      ) {
        throw AppException.Conflict(
          ErrorCode.TEAM_ALREADY_MEMBER,
          'This person is already invited or in the team',
        );
      }

      const taken = await tx.profileMember.count({
        where: { profileId, status: { in: [...SEAT_STATES] } },
      });
      if (taken >= TEAM_SEATS) {
        throw AppException.Conflict(
          ErrorCode.TEAM_FULL,
          `A team has at most ${TEAM_SEATS} people besides the owner`,
          { max: TEAM_SEATS },
        );
      }

      // A person who declined or was removed can be invited again.
      const fresh = {
        role: input.role,
        status: 'INVITED' as const,
        invitedById: userId,
        acceptedAt: null,
        removedAt: null,
      };
      return existing
        ? tx.profileMember.update({ where: { id: existing.id }, data: fresh })
        : tx.profileMember.create({
            data: { profileId, userId: invitee.userId, ...fresh },
          });
    });

    await this.notifyPerson(invitee.userId, profileId, {
      key: 'team_invited',
      role: input.role,
    });
    return member;
  }

  // The owner removes a member, or withdraws an invitation. The access
  // ends at once.
  async remove(userId: string, profileId: string, memberId: string) {
    await this.access.assertCan(userId, profileId, 'team.manage');
    const result = await this.prisma.profileMember.updateMany({
      where: { id: memberId, profileId, status: { in: [...SEAT_STATES] } },
      data: { status: 'REMOVED', removedAt: new Date() },
    });
    if (result.count === 0) {
      throw AppException.NotFound(
        ErrorCode.TEAM_MEMBER_NOT_FOUND,
        'No such member in this team',
      );
    }
    return { success: true };
  }

  // What was done on the Profile in use and by whom, newest first, for its
  // owner (PD-014: the owner sees every person's actions).
  async activity(userId: string, profileId: string, page = 1, limit = 20) {
    await this.access.assertCan(userId, profileId, 'team.manage');
    const where = { profileId };
    const [rows, total] = await Promise.all([
      this.prisma.profileActivity.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          targetId: true,
          createdAt: true,
          userId: true,
          user: { select: PERSON_SELECT },
        },
      }),
      this.prisma.profileActivity.count({ where }),
    ]);
    return createPaginatedResult(
      rows.map(({ user, userId: actorId, ...row }) => ({
        ...row,
        // The owner's own actions are marked as theirs.
        byOwner: actorId === userId,
        person: user?.profiles[0] ?? null,
      })),
      total,
      page,
      limit,
    );
  }

  // The Business Profiles the person works on as an active member, for the
  // Profile switcher.
  async memberProfiles(userId: string) {
    const rows = await this.prisma.profileMember.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { acceptedAt: 'asc' },
      select: {
        role: true,
        profile: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true,
            accountType: true,
          },
        },
      },
    });
    return rows.map(({ role, profile }) => ({ ...profile, memberRole: role }));
  }

  // The invitations waiting for the person.
  async invitations(userId: string) {
    const rows = await this.prisma.profileMember.findMany({
      where: { userId, status: 'INVITED' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        role: true,
        createdAt: true,
        profile: {
          select: { id: true, username: true, fullName: true, avatar: true },
        },
      },
    });
    return rows;
  }

  // The person accepts. Two-step verification must be on in the sign-in
  // they use, as the decision asks of every member.
  async accept(userId: string, memberId: string, signInId?: string) {
    const invitation = await this.ownInvitation(userId, memberId);
    const signIn = await this.prisma.signIn.findFirst({
      where: signInId ? { id: signInId, userId } : { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { isTwoFactorEnabled: true },
    });
    if (!signIn?.isTwoFactorEnabled) {
      throw AppException.Forbidden(
        ErrorCode.TEAM_TWO_FACTOR_REQUIRED,
        'Turn on two-step verification to join a team',
      );
    }
    const accepted = await this.prisma.profileMember.updateMany({
      where: { id: invitation.id, status: 'INVITED' },
      data: { status: 'ACTIVE', acceptedAt: new Date() },
    });
    if (accepted.count === 0) throw this.notFound();

    await this.notifyProfile(invitation.profileId, userId, {
      key: 'team_accepted',
      role: invitation.role,
    });
    return { success: true };
  }

  async decline(userId: string, memberId: string) {
    const invitation = await this.ownInvitation(userId, memberId);
    await this.prisma.profileMember.updateMany({
      where: { id: invitation.id, status: 'INVITED' },
      data: { status: 'DECLINED' },
    });
    return { success: true };
  }

  private async ownInvitation(userId: string, memberId: string) {
    const invitation = await this.prisma.profileMember.findFirst({
      where: { id: memberId, userId, status: 'INVITED' },
      select: { id: true, profileId: true, role: true },
    });
    if (!invitation) throw this.notFound();
    return invitation;
  }

  private notFound() {
    return AppException.NotFound(
      ErrorCode.TEAM_MEMBER_NOT_FOUND,
      'No such invitation',
    );
  }

  // A notice to the person's first Profile, sent by the Business Profile.
  private async notifyPerson(
    personId: string,
    profileId: string,
    notice: { key: 'team_invited'; role: ProfileMemberRole },
  ) {
    const recipient = await this.prisma.profile.findFirst({
      where: { userId: personId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!recipient) return;
    this.events.emit('notification.create', {
      recipientId: recipient.id,
      senderId: profileId,
      type: NotificationType.SYSTEM,
      notice,
      targetType: 'team',
      targetId: profileId,
    } satisfies NotificationCreateEvent['payload']);
  }

  // A notice to the Business Profile, sent by the person's first Profile.
  private async notifyProfile(
    profileId: string,
    personId: string,
    notice: { key: 'team_accepted'; role: ProfileMemberRole },
  ) {
    const sender = await this.prisma.profile.findFirst({
      where: { userId: personId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!sender) return;
    this.events.emit('notification.create', {
      recipientId: profileId,
      senderId: sender.id,
      type: NotificationType.SYSTEM,
      notice,
      targetType: 'team',
      targetId: profileId,
    } satisfies NotificationCreateEvent['payload']);
  }
}
