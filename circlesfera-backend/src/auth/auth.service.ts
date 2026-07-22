import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import type { Queue } from 'bullmq';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  RequestResetDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/index.js';

/**
 * Service responsible for authentication, registration, and session management.
 * Handles password hashing (Argon2), JWT token generation/rotation, email verification,
 * and password reset flows. Supports legacy bcrypt migration on login.
 */

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @InjectQueue('users-processing') private readonly usersQueue: Queue,
  ) {}

  /**
   * Register a new user with email, username, and password.
   * Creates a user record with an Argon2-hashed password, sends a verification email,
   * and returns JWT tokens for immediate session initialization.
   * @param dto - Registration data (email, username, password, optional fullName)
   * @returns Access and refresh token pair
   * @throws ConflictException if email or username already exists
   */
  async register(
    dto: RegisterDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
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

    const verificationToken = randomUUID();

    // Create user and profile
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        verificationToken,
        inviteCode:
          randomUUID().split('-')[0].toUpperCase() +
          Math.random().toString(36).substring(2, 6).toUpperCase(),
        referredById,
        profile: {
          create: {
            username: dto.username,
            fullName: dto.fullName || null,
          },
        },
      },
    });

    // Send verification email
    await this.emailService.sendVerificationEmail(
      user.email,
      verificationToken,
    );

    // Generate tokens
    return this.generateTokens(user.id, user.email);
  }

  /**
   * Verify a user's email address using a one-time token.
   * @param dto - Contains the verification token from the email link
   * @returns Success message
   * @throws BadRequestException if token is invalid or expired
   */
  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: dto.token },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
      },
    });

    return { message: 'Email verified successfully' };
  }

  /**
   * Initiate a password reset by generating a token and emailing it.
   * Returns a generic success message regardless of whether the user exists (security).
   * @param dto - Contains the user's email
   * @returns Generic success message
   */
  async requestPasswordReset(dto: RequestResetDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Return success even if user not found for security (silent fail)
      return { message: 'If an account exists, a reset email has been sent' };
    }

    const resetToken = randomUUID();
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

  /**
   * Reset a user's password using a valid reset token.
   * Hashes the new password with Argon2 and clears the reset token.
   * @param dto - Contains the reset token and new password
   * @returns Success message
   * @throws BadRequestException if token is invalid or expired
   */
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { resetToken: dto.token },
    });

    if (
      !user ||
      (user.resetTokenExpires && user.resetTokenExpires < new Date())
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await argon2.hash(dto.newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    // Revoke all existing sessions to prevent hijack persistence
    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    return { message: 'Password reset successfully' };
  }

  /**
   * Authenticate a user by email/username and password.
   * Supports both Argon2 (modern) and bcrypt (legacy) password verification.
   * Automatically migrates legacy bcrypt hashes to Argon2 on successful login.
   * @param dto - Login credentials (email or username, password)
   * @returns Access and refresh token pair
   * @throws UnauthorizedException if credentials are invalid or account is deactivated
   */
  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Find user by email or username
    let user = await this.prisma.user.findUnique({
      where: { email: dto.identifier },
    });

    if (!user) {
      // Try finding by username in profile
      const profile = await this.prisma.profile.findFirst({
        where: { username: { equals: dto.identifier, mode: 'insensitive' } },
        include: { user: true },
      });
      if (profile) {
        user = profile.user;
      }
    }

    if (!user) {
      throw new UnauthorizedException('Invalid email, username or password');
    }

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
        // Plain text or malformed hash fallback (used if manually edited in DB)
        isPasswordValid = user.password === dto.password;

        if (isPasswordValid) {
          // Auto-migrate plain text to argon2
          const newHashedPassword = await argon2.hash(dto.password);
          await this.prisma.user.update({
            where: { id: user.id },
            data: { password: newHashedPassword },
          });
        }
      }
    } catch {
      // If verify or compare throws (e.g., malformed hash string), fail securely without 500
      isPasswordValid = false;
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      if (user.deletedAt && user.deletedAt > new Date()) {
        // Auto-restore account if logged in during GDPR grace period
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isActive: true, deletedAt: null },
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
      } else {
        const secret =
          this.configService.get<string>('JWT_SECRET') ||
          'circlesfera_default_secret_key';
        const appealToken = this.jwtService.sign(
          { sub: user.id, isAppealToken: true },
          { expiresIn: '15m', secret },
        );
        throw new UnauthorizedException({
          message: 'ACCOUNT_BANNED',
          appealToken,
        });
      }
    }

    if (user.isTwoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new UnauthorizedException('2FA_REQUIRED'); // Custom error message so frontend knows
      }

      if (!user.twoFactorSecret) {
        throw new UnauthorizedException('2FA configuration error');
      }

      try {
        const { verifySync } = await import('otplib');
        const isTwoFactorCodeValid = verifySync({
          token: dto.twoFactorCode,
          secret: user.twoFactorSecret,
        })?.valid;

        if (!isTwoFactorCodeValid) {
          throw new UnauthorizedException('Invalid 2FA code');
        }
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        throw new UnauthorizedException('Invalid 2FA code or configuration');
      }
    }

    // Generate tokens
    return this.generateTokens(user.id, user.email);
  }

  /**
   * Login a user directly by ID (used for Passkey authentication).
   * @param userId - The user's unique identifier
   * @returns Access and refresh token pair
   * @throws UnauthorizedException if user not found or inactive
   */
  async loginById(
    userId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      if (user.deletedAt && user.deletedAt > new Date()) {
        // Auto-restore account if logged in during GDPR grace period
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isActive: true, deletedAt: null },
        });

        // Cancel the scheduled hard delete job
        const job = await this.usersQueue.getJob(`delete-${user.id}`);
        if (job) {
          await job.remove();
        }
      } else {
        const appealToken = this.jwtService.sign(
          { sub: user.id, isAppealToken: true },
          { expiresIn: '15m', secret: this.configService.get('JWT_SECRET') },
        );
        throw new UnauthorizedException({
          message: 'ACCOUNT_BANNED',
          appealToken,
        });
      }
    }

    return this.generateTokens(user.id, user.email);
  }

  /**
   * Rotate a refresh token: validates the old one, deletes it, and issues a new pair.
   * @param dto - Contains the current refresh token
   * @returns New access and refresh token pair
   * @throws UnauthorizedException if token is invalid, expired, or not found
   */
  async refreshToken(
    dto: RefreshTokenDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify<{ sub: string; email: string }>(
        dto.refreshToken,
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        },
      );

      // Check if refresh token exists in database
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: dto.refreshToken },
      });

      if (!storedToken || storedToken.userId !== payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if token is expired
      if (storedToken.expiresAt < new Date()) {
        await this.prisma.refreshToken.delete({
          where: { id: storedToken.id },
        });
        throw new UnauthorizedException('Refresh token expired');
      }

      // Delete old refresh token
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });

      // Generate new tokens
      return this.generateTokens(payload.sub, payload.email);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Invalidate a specific refresh token for the given user.
   * @param userId - The authenticated user's ID
   * @param refreshToken - The refresh token to revoke
   */
  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        token: refreshToken,
      },
    });
  }

  /**
   * Get all active sessions for a user.
   */
  async getUserSessions(userId: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
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

  /**
   * Revoke a specific session by ID for a user.
   */
  async revokeSession(userId: string, sessionId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: {
        id: sessionId,
        userId,
      },
    });
    return { success: true };
  }

  /**
   * Revoke all sessions for a user except an optional current session ID.
   */
  async revokeOtherSessions(userId: string, currentSessionId?: string) {
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
      },
    });
    return { success: true };
  }

  /**
   * Generate a new access/refresh token pair and persist the refresh token in the database.
   * Access tokens expire in 15 minutes; refresh tokens expire in 7 days.
   * @param userId - User ID to encode in the JWT payload
   * @param email - User email to encode in the JWT payload
   * @param userAgent - Optional client browser/device User-Agent string
   * @param ipAddress - Optional client IP address
   * @returns Signed access and refresh token pair
   */
  public async generateTokens(
    userId: string,
    email: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: userId, email, jti: randomUUID() };

    const jwtSecret =
      this.configService.get<string>('JWT_SECRET') ||
      'circlesfera_default_secret_key';
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'circlesfera_default_refresh_secret_key';

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: '7d',
    });

    // Store refresh token in database with defensive fallback for schema variations
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    try {
      await this.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId,
          userAgent: userAgent || null,
          ipAddress: ipAddress || null,
          expiresAt,
        },
      });
    } catch (_err) {
      // Fallback: If userAgent or ipAddress columns are missing in legacy DB schemas before migration runs
      await this.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId,
          expiresAt,
        },
      });
    }

    return { accessToken, refreshToken };
  }
}
