import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminAction, type SuspensionCause } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfileStrikesService } from '../strikes/profile-strikes.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// The direct staff suspension of one Profile, for a serious cause. The other
// Profiles of the same person are not touched.
@Injectable()
export class AdminProfileSuspensionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProfileStrikesService)
    private readonly strikes: ProfileStrikesService,
  ) {}

  async suspend(
    adminId: string,
    profileId: string,
    input: { cause: SuspensionCause; days: number; note: string },
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, userId: true, isAccountBanned: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    if (profile.isAccountBanned) {
      throw new ConflictException('This profile is banned');
    }

    const until = new Date(Date.now() + input.days * DAY_MS);
    await this.strikes.suspendProfile({
      adminId,
      userId: profile.userId,
      profileId,
      until,
      cause: input.cause,
    });
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: AdminAction.ACCOUNT_SUSPENDED,
        targetType: 'profile',
        targetId: profileId,
        details: `Cause ${input.cause}, until ${until.toISOString()}: ${input.note.trim()}`,
      },
    });
    return { success: true, suspendedUntil: until, cause: input.cause };
  }

  // Ends a suspension of one Profile early, whatever set it.
  async lift(adminId: string, profileId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, suspendedUntil: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    if (!profile.suspendedUntil || profile.suspendedUntil <= new Date()) {
      throw new ConflictException('This profile is not suspended');
    }

    await this.strikes.liftSuspension(profileId);
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: AdminAction.ACCOUNT_RESTORED,
        targetType: 'profile',
        targetId: profileId,
      },
    });
    return { success: true };
  }
}
