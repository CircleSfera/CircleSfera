import { AccountType, Role, User, VerificationLevel } from '@prisma/client';
import { Exclude } from 'class-transformer';

export class UserEntity implements User {
  id!: string;
  email!: string;

  isRootBanned!: boolean;
  rootBanReason!: string | null;

  @Exclude()
  password!: string;

  createdAt!: Date;
  updatedAt!: Date;
  isActive!: boolean;
  strikeCount!: number;
  deletedAt!: Date | null;
  scheduledDeletionAt!: Date | null;

  inviteCode!: string | null;
  referredById!: string | null;
  role!: Role;
  identityVerifiedAt!: Date | null;
  dateOfBirth!: Date | null;

  @Exclude()
  stripeIdentitySessionId!: string | null;

  emailVerified!: Date | null;

  @Exclude()
  verificationToken!: string | null;

  isTwoFactorEnabled!: boolean;

  @Exclude()
  twoFactorSecret!: string | null;

  @Exclude()
  resetToken!: string | null;

  @Exclude()
  resetTokenExpires!: Date | null;

  verificationLevel!: VerificationLevel;
  accountType!: AccountType;

  @Exclude()
  currentChallenge!: string | null;

  isOnline!: boolean;
  lastSeenAt!: Date | null;

  @Exclude()
  stripeCustomerId!: string | null;

  @Exclude()
  stripeConnectAccountId!: string | null;

  @Exclude()
  signupIpHash!: string | null;

  @Exclude()
  lastIpHash!: string | null;

  /** Admin / GDPR only — never serialize to public profile APIs. */
  @Exclude()
  signupIp!: string | null;

  @Exclude()
  lastIp!: string | null;

  signupCountry!: string | null;
  botLabeledAt!: Date | null;
  botLabelReason!: string | null;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
