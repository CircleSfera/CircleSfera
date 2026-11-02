import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const PAYOUT_ROW = {
  userId: true,
  profileId: true,
  stripeConnectAccountId: true,
  transfersEnabled: true,
  verifiedCompany: true,
} as const;

// The Business Profiles and the three things the "Verified company" label
// needs, for support to say why a Profile has it or not. Read only: the plan
// is bought by the person, and the company is verified by the payment
// provider.
@Injectable()
export class AdminCompaniesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCompanies(page = 1, limit = 20, search?: string) {
    const term = search?.trim();
    const where: Prisma.ProfileWhereInput = {
      accountType: 'BUSINESS',
      ...(term
        ? {
            OR: [
              { username: { contains: term, mode: 'insensitive' } },
              { fullName: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [profiles, total] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          username: true,
          fullName: true,
          avatar: true,
          verificationLevel: true,
        },
      }),
      this.prisma.profile.count({ where }),
    ]);

    // The payout account each Profile is paid into, as the label reads it
    // (payoutRowForProfile): its own once it can receive transfers, else
    // its person's. Read for the whole page in two queries.
    const [own, persons] = await Promise.all([
      this.prisma.monetization.findMany({
        where: { profileId: { in: profiles.map((p) => p.id) } },
        select: PAYOUT_ROW,
      }),
      this.prisma.monetization.findMany({
        where: { userId: { in: [...new Set(profiles.map((p) => p.userId))] } },
        select: PAYOUT_ROW,
      }),
    ]);
    const ownOf = new Map(own.map((row) => [row.profileId, row]));
    const personOf = new Map(persons.map((row) => [row.userId, row]));
    const data = profiles.map((profile) => {
      const mine = ownOf.get(profile.id);
      const payout =
        mine?.stripeConnectAccountId && (mine.userId || mine.transfersEnabled)
          ? mine
          : personOf.get(profile.userId);
      const onBusinessPlan = profile.verificationLevel === 'BUSINESS';
      const companyVerified = !!payout?.verifiedCompany;
      return {
        id: profile.id,
        username: profile.username,
        fullName: profile.fullName,
        avatar: profile.avatar,
        onBusinessPlan,
        payoutConnected: !!payout?.stripeConnectAccountId,
        companyVerified,
        labelShown: onBusinessPlan && companyVerified,
      };
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
