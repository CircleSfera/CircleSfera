import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { payoutRowForProfile } from '../monetization/payout-account.js';
import { PrismaService } from '../prisma/prisma.service.js';

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

    // The payout account each Profile is paid into, as the label reads it:
    // its own, else its person's.
    const data = [];
    for (const profile of profiles) {
      const payout = await payoutRowForProfile(this.prisma, profile);
      const onBusinessPlan = profile.verificationLevel === 'BUSINESS';
      const payoutConnected = !!payout?.stripeConnectAccountId;
      const companyVerified = !!payout?.verifiedCompany;
      data.push({
        id: profile.id,
        username: profile.username,
        fullName: profile.fullName,
        avatar: profile.avatar,
        onBusinessPlan,
        payoutConnected,
        companyVerified,
        labelShown: onBusinessPlan && companyVerified,
      });
    }

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
