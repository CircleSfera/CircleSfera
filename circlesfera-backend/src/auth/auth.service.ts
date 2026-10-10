import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { ApiErrorCode } from '@circlesfera/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import type { Queue } from 'bullmq';
import type { Cache } from 'cache-manager';
import {
  type AbuseRequestMeta,
  DeviceSignalService,
} from '../common/abuse/device-signal.service.js';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import { toSupportedLocale } from '../common/constants/locale.constants.js';
import { CryptoService } from '../common/services/crypto.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from '../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import type {
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  RequestResetDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/index.js';
import { AccountStateService } from './services/account-state.service.js';
import {
  pickSessionProfile,
  SESSION_PROFILE_ORDER,
  SESSION_PROFILE_SELECT,
} from './services/session-profile.util.js';

// Service responsible for authentication, registration, and session management.
// Handles password hashing (Argon2), JWT token generation/rotation, email verification,
// And password reset flows. Supports legacy bcrypt migration on login.

// What signing in with a password needs from the sign-in: the password and
// the secret of its second step.
const LOGIN_SIGN_IN_OMIT = { password: false, twoFactorSecret: false } as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @InjectQueue('users-processing') private readonly usersQueue: Queue,
    @Inject(SystemSettingsService)
    private readonly systemSettings: SystemSettingsService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
    @Inject(DeviceSignalService)
    private readonly deviceSignals: DeviceSignalService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(CryptoService) private readonly cryptoService: CryptoService,
    @Inject(AccountStateService)
    private readonly accountStateService: AccountStateService,
  ) {}

  // Register a new user with email, username, and password.
  // Creates a user record with an Argon2-hashed password, sends a verification email,
  // And returns JWT tokens for immediate session initialization.
  // Param dto: Registration data (email, username, password, optional fullName)
  // Returns Access and refresh token pair
  // Throws ConflictException if email or username already exists
  async register(
    dto: RegisterDto,
    meta: AbuseRequestMeta = {},
  ): Promise<{ accessToken: string; refreshToken: string }> {
    await this.turnstile.assertValid(
      dto.captchaToken,
      meta.ip,
      meta.turnstileBypassToken,
    );
    const registrationOpen = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.REGISTRATION_OPEN,
    );
    if (!registrationOpen) {
      throw new BadRequestException(ApiErrorCode.REGISTRATION_CLOSED);
    }

    const requireInvite = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.REQUIRE_INVITE_CODE,
    );
    if (requireInvite && !dto.inviteCode?.trim()) {
      throw new BadRequestException(ApiErrorCode.INVITE_CODE_REQUIRED);
    }

    const dateOfBirth = new Date(dto.dateOfBirth);
    if (Number.isNaN(dateOfBirth.getTime())) {
      throw new BadRequestException('Invalid date of birth');
    }
    const minimumDob = new Date();
    minimumDob.setFullYear(minimumDob.getFullYear() - 16);
    minimumDob.setHours(0, 0, 0, 0);
    if (dateOfBirth > minimumDob) {
      throw new BadRequestException(
        'You must be at least 16 years old to register',
      );
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Check if username is taken
    const existingProfile = await this.prisma.profile.findFirst({
      where: { username: { equals: dto.username, mode: 'insensitive' } },
    });

    if (existingProfile) {
      throw new ConflictException('Username already taken');
    }

    let referredById: string | undefined;
    if (dto.inviteCode) {
      const referringUser = await this.prisma.user.findUnique({
        where: { inviteCode: dto.inviteCode },
        include: { _count: { select: { referrals: true } } },
      });
      if (!referringUser) {
        throw new BadRequestException('Invalid invite code');
      }
      if (referringUser._count.referrals >= 3) {
        throw new BadRequestException(
          'This invite code has reached its maximum usage limit',
        );
      }
      referredById = referringUser.id;
    }

    // Hash password
    const hashedPassword = await argon2.hash(dto.password);

    // Generate high-entropy token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create user and profile
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        verificationToken,
        dateOfBirth,
        locale: toSupportedLocale(dto.locale),
        inviteCode:
          randomUUID().split('-')[0].toUpperCase() +
          Math.random().toString(36).substring(2, 6).toUpperCase(),
        referredById,
        profiles: {
          create: {
            username: dto.username,
            fullName: dto.fullName || null,
          },
        },
      },
      include: {
        profiles: true,
      },
    });

    // Send verification email
    await this.emailService.sendVerificationEmail(
      user.email,
      verificationToken,
    );

    await this.deviceSignals.recordSignup(user.id, {
      ...meta,
      visitorId: dto.visitorId,
    });

    // Generate tokens
    return this.generateTokens(
      user.id,
      user.email,
      meta.userAgent || undefined,
      meta.ip || undefined,
      undefined,
      user.profiles?.[0]?.id,
    );
  }

  // Verify a user's email address using a one-time token.
  // Param dto: Contains the verification token from the email link
  // Returns Success message
  // Throws BadRequestException if token is invalid or expired
  async verifyEmail(dto: VerifyEmailDto) {
    // The token is looked for on the sign-in; the account is written, and
    // the database copies the change to the sign-in in the same transaction.
    const signIn = await this.prisma.signIn.findUnique({
      where: { verificationToken: dto.token },
      select: { userId: true },
    });

    if (!signIn) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    const user = { id: signIn.userId };

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
      },
    });

    const profile = await this.prisma.profile.findFirst({
      where: { userId: user.id },
      select: { username: true },
    });
    if (profile?.username) {
      await this.cacheManager.del(`profile:${profile.username}`);
    }

    return { message: 'Email verified successfully' };
  }

  async resendVerification(userId: string): Promise<{ message: string }> {
    // The first sign-in of the account: the one its Profiles share.
    const user = await this.prisma.signIn.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { email: true, emailVerified: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.emailVerified) {
      return { message: 'Email already verified' };
    }
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: userId },
      data: { verificationToken },
    });
    await this.emailService.sendVerificationEmail(
      user.email,
      verificationToken,
    );
    return { message: 'Verification email sent' };
  }

  // Initiate a password reset by generating a token and emailing it.
  // Returns a generic success message regardless of whether the user exists (security).
  // Param dto: Contains the user's email
  // Returns Generic success message
  async requestPasswordReset(dto: RequestResetDto) {
    const signIn = await this.prisma.signIn.findUnique({
      where: { email: dto.email },
      select: { userId: true, email: true },
    });
    const user = signIn && { id: signIn.userId, email: signIn.email };

    if (!user) {
      // Return success even if user not found for security (silent fail)
      return { message: 'If an account exists, a reset email has been sent' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpires,
      },
    });

    await this.emailService.sendPasswordResetEmail(user.email, resetToken);

    return { message: 'If an account exists, a reset email has been sent' };
  }

  // Reset a user's password using a valid reset token.
  // Hashes the new password with Argon2 and clears the reset token.
  // Param dto: Contains the reset token and new password
  // Returns Success message
  // Throws BadRequestException if token is invalid or expired
  async resetPassword(dto: ResetPasswordDto) {
    const signIn = await this.prisma.signIn.findUnique({
      where: { resetToken: dto.token },
      select: { userId: true, resetTokenExpires: true },
    });

    if (
      !signIn ||
      (signIn.resetTokenExpires && signIn.resetTokenExpires < new Date())
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    const user = { id: signIn.userId };

    const hashedPassword = await argon2.hash(dto.newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
        passwordResetRequiredAt: null,
      },
    });

    // Revoke all existing sessions to prevent hijack persistence
    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    return { message: 'Password reset successfully' };
  }

  // Authenticate a user by email/username and password.
  // Supports both Argon2 (modern) and bcrypt (legacy) password verification.
  // Automatically migrates legacy bcrypt hashes to Argon2 on successful login.
  // Param dto: Login credentials (email or username, password)
  // Returns Access and refresh token pair
  // Throws UnauthorizedException if credentials are invalid or account is deactivated
  async login(
    dto: LoginDto,
    meta: AbuseRequestMeta = {},
  ): Promise<{ accessToken: string; refreshToken: string }> {
    await this.turnstile.assertValid(
      dto.captchaToken,
      meta.ip,
      meta.turnstileBypassToken,
    );
    // Find user by email or username
    // Login is one of the few readers that needs the secrets the client omits
    // by default (see USER_SECRET_OMIT).
    // The password is the one of the sign-in: found by its email, or through
    // the Profile with that username. The account behind it says who the
    // person is and whether they may come in.
    const withAccount = {
      omit: LOGIN_SIGN_IN_OMIT,
      include: { user: true },
    } as const;
    let signIn = await this.prisma.signIn.findUnique({
      where: { email: dto.identifier },
      ...withAccount,
    });

    if (!signIn) {
      // Try finding by username in profile
      const profile = await this.prisma.profile.findFirst({
        where: { username: { equals: dto.identifier, mode: 'insensitive' } },
        select: { signIn: withAccount },
      });
      signIn = profile?.signIn ?? null;
    }

    // A Profile without a sign-in, or a sign-in without its account, is
    // answered like an unknown identifier.
    if (!signIn?.user) {
      throw new UnauthorizedException('Invalid email, username or password');
    }
    const user = {
      ...signIn.user,
      email: signIn.email,
      password: signIn.password,
      passwordResetRequiredAt: signIn.passwordResetRequiredAt,
      isTwoFactorEnabled: signIn.isTwoFactorEnabled,
      twoFactorSecret: signIn.twoFactorSecret,
    };

    // Verify password
    let isPasswordValid = false;

    try {
      // Check if it's an argon2 hash (modern) or bcrypt (legacy)
      if (user.password.startsWith('$argon2')) {
        isPasswordValid = await argon2.verify(user.password, dto.password);
      } else if (
        user.password.startsWith('$2b$') ||
        user.password.startsWith('$2a$') ||
        user.password.startsWith('$2y$')
      ) {
        // Legacy bcrypt support
        isPasswordValid = await bcrypt.compare(dto.password, user.password);

        // If valid, migrate to argon2
        if (isPasswordValid) {
          const newHashedPassword = await argon2.hash(dto.password);
          await this.prisma.user.update({
            where: { id: user.id },
            data: { password: newHashedPassword },
          });
        }
      } else {
        // Reject unknown/plaintext password formats; fail closed
        this.logger.warn(
          `Authentication rejected for user ${user.id}: Stored password hash format is unrecognized (fail closed).`,
        );
        isPasswordValid = false;
      }
    } catch {
      // If verify or compare throws (e.g., malformed hash string), fail securely without 500
      isPasswordValid = false;
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Checked only after the password matches, so the response does not reveal
    // which identifiers exist.
    if (user.passwordResetRequiredAt) {
      throw new UnauthorizedException(ApiErrorCode.PASSWORD_RESET_REQUIRED);
    }

    if (!user.isActive) {
      if (user.scheduledDeletionAt && user.scheduledDeletionAt > new Date()) {
        // Auto-restore account if logged in during GDPR grace period
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            isActive: true,
            deletedAt: null,
            scheduledDeletionAt: null,
          },
        });

        // Cancel the scheduled hard delete job safely
        try {
          if (this.usersQueue) {
            const job = await this.usersQueue.getJob(`delete-${user.id}`);
            if (job) {
              await job.remove();
            }
          }
        } catch (_err) {
          // Ignore queue connection issues during login restore
        }
      } else if (user.isRootBanned) {
        throw new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          // Extra fields go under details: the global exception filter only
          // forwards message, errorCode and details to the client.
          details: {
            reason: user.rootBanReason,
          },
        });
      } else if (user.deactivatedAt) {
        // Self-deactivated accounts come back on login. Moderation never
        // sets deactivatedAt, so staff deactivations still fall through to
        // the banned response below.
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isActive: true, deactivatedAt: null },
        });
      } else {
        const secret = this.configService.getOrThrow<string>('JWT_SECRET');
        const appealToken = this.jwtService.sign(
          { sub: user.id, isAppealToken: true },
          { expiresIn: '15m', secret },
        );
        throw new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          // Extra fields go under details: the global exception filter only
          // forwards message, errorCode and details to the client.
          details: {
            appealToken,
            reason: user.rootBanReason || undefined,
          },
        });
      }
    } else if (user.isRootBanned) {
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      const appealToken = this.jwtService.sign(
        { sub: user.id, isAppealToken: true },
        { expiresIn: '15m', secret },
      );
      throw new UnauthorizedException({
        message: ApiErrorCode.ACCOUNT_BANNED,
        // Extra fields go under details: the global exception filter only
        // forwards message, errorCode and details to the client.
        details: {
          reason: user.rootBanReason,
          appealToken,
        },
      });
    }

    // Profile-level bans and suspensions: sign in with a usable Profile.
    const loginProfile = await this.resolveLoginProfileOrThrow(user.id);

    if (user.isTwoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new UnauthorizedException(ApiErrorCode.TWO_FA_REQUIRED); // Custom error message so frontend knows
      }

      if (!user.twoFactorSecret) {
        throw new UnauthorizedException('2FA configuration error');
      }

      try {
        const { verifySync } = await import('otplib');
        const rawSecret = user.twoFactorSecret;
        const secret = this.cryptoService.decrypt(rawSecret);
        const isTwoFactorCodeValid = verifySync({
          token: dto.twoFactorCode,
          secret,
          epochTolerance: 120,
        })?.valid;

        if (!isTwoFactorCodeValid) {
          throw new UnauthorizedException('Invalid 2FA code');
        }

        // Opportunistic rolling migration for legacy plaintext secrets
        if (!rawSecret.includes(':')) {
          void this.prisma.user
            .update({
              where: { id: user.id },
              data: { twoFactorSecret: this.cryptoService.encrypt(secret) },
            })
            .catch(() => undefined);
        }
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        throw new UnauthorizedException('Invalid 2FA code or configuration');
      }
    }

    await this.deviceSignals.recordLogin(user.id, {
      ...meta,
      visitorId: dto.visitorId,
    });

    return this.generateTokens(
      user.id,
      user.email,
      meta.userAgent || undefined,
      meta.ip || undefined,
      undefined,
      loginProfile?.id,
    );
  }

  // Login a user directly by ID (used for Passkey authentication).
  // Param userId: The user's unique identifier
  // Returns Access and refresh token pair
  // Throws UnauthorizedException if user not found or inactive
  async loginById(
    userId: string,
    meta: AbuseRequestMeta = {},
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      if (user.scheduledDeletionAt && user.scheduledDeletionAt > new Date()) {
        // Auto-restore account if logged in during GDPR grace period
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            isActive: true,
            deletedAt: null,
            scheduledDeletionAt: null,
          },
        });

        // Cancel the scheduled hard delete job
        const job = await this.usersQueue.getJob(`delete-${user.id}`);
        if (job) {
          await job.remove();
        }
      } else if (user.isRootBanned) {
        throw new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          // Extra fields go under details: the global exception filter only
          // forwards message, errorCode and details to the client.
          details: {
            reason: user.rootBanReason,
          },
        });
      } else if (user.deactivatedAt) {
        // Self-deactivated accounts come back on login. Moderation never
        // sets deactivatedAt, so staff deactivations still fall through to
        // the banned response below.
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isActive: true, deactivatedAt: null },
        });
      } else {
        const secret = this.configService.getOrThrow<string>('JWT_SECRET');
        const appealToken = this.jwtService.sign(
          { sub: user.id, isAppealToken: true },
          { expiresIn: '15m', secret },
        );
        throw new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          // Extra fields go under details: the global exception filter only
          // forwards message, errorCode and details to the client.
          details: {
            appealToken,
            reason: user.rootBanReason || undefined,
          },
        });
      }
    } else if (user.isRootBanned) {
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      const appealToken = this.jwtService.sign(
        { sub: user.id, isAppealToken: true },
        { expiresIn: '15m', secret },
      );
      throw new UnauthorizedException({
        message: ApiErrorCode.ACCOUNT_BANNED,
        // Extra fields go under details: the global exception filter only
        // forwards message, errorCode and details to the client.
        details: {
          reason: user.rootBanReason,
          appealToken,
        },
      });
    }

    const loginProfile = await this.resolveLoginProfileOrThrow(user.id);

    return this.generateTokens(
      user.id,
      user.email,
      meta.userAgent || undefined,
      meta.ip || undefined,
      undefined,
      loginProfile?.id,
    );
  }

  // Rotate a refresh token: validates the old one, deletes it, and issues a new pair.
  // Param dto: Contains the current refresh token
  // Computes a SHA-256 cryptographic digest of a refresh token for storage at rest.
  private hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Returns New access and refresh token pair
  // Throws UnauthorizedException if token is invalid, expired, revoked, or reused
  async refreshToken(
    dto: RefreshTokenDto,
    meta: AbuseRequestMeta = {},
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!dto.refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    const refreshToken = dto.refreshToken;

    let payload: {
      sub: string;
      email: string;
      profileId?: string;
      familyId?: string;
      jti?: string;
    };
    try {
      // Verify refresh token signature & expiration
      payload = this.jwtService.verify<{
        sub: string;
        email: string;
        profileId?: string;
        familyId?: string;
        jti?: string;
      }>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const hashedToken = this.hashRefreshToken(refreshToken);

    // Check if refresh token exists in database (check by hash first, fallback to raw for legacy tokens)
    let storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: hashedToken },
    });

    if (!storedToken) {
      storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      });
    }

    if (!storedToken || storedToken.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Token family reuse / replay attack detection (RFC 6819)
    if (storedToken.isRevoked) {
      const familyToRevoke = storedToken.familyId || payload.familyId;
      if (familyToRevoke) {
        await this.prisma.refreshToken.deleteMany({
          where: {
            userId: storedToken.userId,
            familyId: familyToRevoke,
          },
        });
      } else {
        await this.prisma.refreshToken.delete({
          where: { id: storedToken.id },
        });
      }

      this.logger.warn(
        `Security alert: Refresh token replay attack detected for user ${storedToken.userId}, family ${familyToRevoke || 'unknown'}`,
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    // Assert user and profile operational standing before issuing new tokens
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        profiles: {
          orderBy: SESSION_PROFILE_ORDER,
          select: SESSION_PROFILE_SELECT,
        },
      },
    });

    const profile = pickSessionProfile(user?.profiles ?? [], payload.profileId);
    try {
      this.accountStateService.assertOperational(user, profile);
    } catch (error) {
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });
      throw error;
    }

    // Legitimate rotation: mark current token as revoked and issue a new token within the same family
    const currentFamilyId =
      storedToken.familyId || payload.familyId || randomUUID();

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    return this.generateTokens(
      payload.sub,
      payload.email,
      meta.userAgent || undefined,
      meta.ip || undefined,
      currentFamilyId,
      profile?.id,
    );
  }

  // Invalidate a specific refresh token (or its entire session family) for the given user.
  // Param userId: The authenticated user's ID
  // Param refreshToken: The refresh token to revoke
  async logout(userId: string, refreshToken: string): Promise<void> {
    const hashedToken = this.hashRefreshToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        OR: [{ token: hashedToken }, { token: refreshToken }],
      },
    });

    if (stored?.familyId) {
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
          familyId: stored.familyId,
        },
      });
    } else {
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
          OR: [{ token: hashedToken }, { token: refreshToken }],
        },
      });
    }
  }

  // Get all active sessions for a user.
  async getUserSessions(userId: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return sessions;
  }

  // Revoke a specific session by ID for a user.
  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
    });
    if (session?.familyId) {
      await this.prisma.refreshToken.deleteMany({
        where: { familyId: session.familyId, userId },
      });
    } else {
      await this.prisma.refreshToken.deleteMany({
        where: { id: sessionId, userId },
      });
    }
    return { success: true };
  }

  // Revoke all sessions for a user except an optional current session ID.
  async revokeOtherSessions(userId: string, currentSessionId?: string) {
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
      },
    });
    return { success: true };
  }

  // Short-lived token that only allows filing an appeal about the restricted
  // Profile while that Profile cannot sign in.
  private signAppealToken(userId: string, profileId: string): string {
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    return this.jwtService.sign(
      { sub: userId, profileId, isAppealToken: true },
      { expiresIn: '15m', secret },
    );
  }

  // Picks the Profile to sign in with: the oldest one that is not banned or
  // suspended. Access is refused only when every Profile of the account is
  // banned or suspended, with the reason of the oldest one.
  private async resolveLoginProfileOrThrow(userId: string) {
    const profiles = await this.prisma.profile.findMany({
      where: { userId },
      orderBy: SESSION_PROFILE_ORDER,
      select: SESSION_PROFILE_SELECT,
    });
    const loginProfile = pickSessionProfile(profiles);

    if (loginProfile?.isAccountBanned) {
      throw new UnauthorizedException({
        message: ApiErrorCode.ACCOUNT_BANNED,
        // Extra fields go under details: the global exception filter only
        // forwards message, errorCode and details to the client.
        details: {
          reason: loginProfile.accountBanReason,
          appealToken: this.signAppealToken(userId, loginProfile.id),
        },
      });
    }
    if (
      loginProfile?.suspendedUntil &&
      loginProfile.suspendedUntil > new Date()
    ) {
      // A suspended Profile can appeal the suspension without signing in.
      throw new UnauthorizedException({
        message: ApiErrorCode.ACCOUNT_SUSPENDED,
        // Extra fields go under details: the global exception filter only
        // forwards message, errorCode and details to the client.
        details: {
          suspendedUntil: loginProfile.suspendedUntil.toISOString(),
          reason: loginProfile.accountBanReason || undefined,
          appealToken: this.signAppealToken(userId, loginProfile.id),
        },
      });
    }
    return loginProfile;
  }

  // Generate a new access/refresh token pair and persist the refresh token in the database.
  // Access tokens expire in 15 minutes; refresh tokens expire in 7 days.
  // Refresh tokens are cryptographically hashed with SHA-256 before persistence.
  // Param userId: User ID to encode in the JWT payload
  // Param email: User email to encode in the JWT payload
  // Param userAgent: Optional client browser/device User-Agent string
  // Param ipAddress: Optional client IP address
  // Param familyId: Optional token family identifier for session rotation lineage
  // Param profileId: Optional active profile identifier bound to the session
  // Returns Signed access and refresh token pair
  public async generateTokens(
    userId: string,
    email: string,
    userAgent?: string,
    ipAddress?: string,
    familyId?: string,
    profileId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenFamilyId = familyId || randomUUID();
    const payload = {
      sub: userId,
      email,
      ...(profileId ? { profileId } : {}),
      jti: randomUUID(),
      familyId: tokenFamilyId,
    };

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        email,
        ...(profileId ? { profileId } : {}),
        jti: randomUUID(),
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const hashedToken = this.hashRefreshToken(refreshToken);

    try {
      await this.prisma.refreshToken.create({
        data: {
          token: hashedToken,
          userId,
          familyId: tokenFamilyId,
          isRevoked: false,
          userAgent: userAgent || null,
          ipAddress: ipAddress || null,
          expiresAt,
        },
      });
    } catch (_err) {
      // Fallback: If familyId, userAgent or ipAddress columns are missing in legacy DB schemas before migration runs
      await this.prisma.refreshToken.create({
        data: {
          token: hashedToken,
          userId,
          expiresAt,
        },
      });
    }

    return { accessToken, refreshToken };
  }
}
