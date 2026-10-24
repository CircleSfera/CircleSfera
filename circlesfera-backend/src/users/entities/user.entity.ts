import { ApiProperty } from '@nestjs/swagger';
import {
  AccountType,
  type Locale,
  Role,
  User,
  VerificationLevel,
} from '@prisma/client';
import { Exclude } from 'class-transformer';

export class UserEntity implements User {
  @ApiProperty({ required: true, type: () => String })
  id!: string;
  @ApiProperty({ required: true, type: () => String })
  email!: string;

  @ApiProperty({ required: true, type: () => Boolean })
  isRootBanned!: boolean;
  @ApiProperty({ required: true, type: () => String, nullable: true })
  rootBanReason!: string | null;

  // Old copy of the credentials, retired: the app does not read it.
  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  password!: string | null;

  @ApiProperty({ required: true, type: () => Date })
  createdAt!: Date;
  @ApiProperty({ required: true, type: () => Date })
  updatedAt!: Date;
  @ApiProperty({ required: true, type: () => Boolean })
  isActive!: boolean;
  @ApiProperty({ required: true, type: () => Number })
  strikeCount!: number;
  @ApiProperty({ required: true, type: () => Date, nullable: true })
  deletedAt!: Date | null;
  @ApiProperty({ required: true, type: () => Date, nullable: true })
  scheduledDeletionAt!: Date | null;
  @ApiProperty({ required: true, type: () => Date, nullable: true })
  deactivatedAt!: Date | null;

  @ApiProperty({
    required: true,
    enum: ['USER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE'],
  })
  role!: Role;
  @ApiProperty({ required: true, enum: ['en', 'es'] })
  locale!: Locale;
  @ApiProperty({ required: true, type: () => Date, nullable: true })
  identityVerifiedAt!: Date | null;
  @ApiProperty({ required: true, type: () => Date, nullable: true })
  dateOfBirth!: Date | null;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  stripeIdentitySessionId!: string | null;

  @ApiProperty({ required: true, type: () => Date, nullable: true })
  @Exclude()
  emailVerified!: Date | null;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  verificationToken!: string | null;

  @ApiProperty({ required: true, type: () => Boolean })
  @Exclude()
  isTwoFactorEnabled!: boolean;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  twoFactorSecret!: string | null;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  resetToken!: string | null;

  @ApiProperty({ required: true, type: () => Date, nullable: true })
  @Exclude()
  resetTokenExpires!: Date | null;

  @ApiProperty({ required: true, type: () => Date, nullable: true })
  @Exclude()
  passwordResetRequiredAt!: Date | null;

  @ApiProperty({ required: true, type: () => Boolean })
  @Exclude()
  isTestAccount!: boolean;

  @ApiProperty({
    required: true,
    enum: ['BASIC', 'VERIFIED', 'BUSINESS', 'ELITE'],
  })
  verificationLevel!: VerificationLevel;
  @ApiProperty({ required: true, enum: ['BUSINESS', 'PERSONAL', 'CREATOR'] })
  accountType!: AccountType;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  currentChallenge!: string | null;

  @ApiProperty({ required: true, type: () => Boolean })
  isOnline!: boolean;
  @ApiProperty({ required: true, type: () => Date, nullable: true })
  lastSeenAt!: Date | null;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  stripeCustomerId!: string | null;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  stripeConnectAccountId!: string | null;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  signupIpHash!: string | null;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  lastIpHash!: string | null;

  // Admin / GDPR only — never serialize to public profile APIs.
  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  signupIp!: string | null;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  @Exclude()
  lastIp!: string | null;

  @ApiProperty({ required: true, type: () => Date, nullable: true })
  @Exclude()
  lastIpAt!: Date | null;

  @ApiProperty({ required: true, type: () => String, nullable: true })
  signupCountry!: string | null;
  @ApiProperty({ required: true, type: () => Date, nullable: true })
  botLabeledAt!: Date | null;
  @ApiProperty({ required: true, type: () => String, nullable: true })
  botLabelReason!: string | null;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
