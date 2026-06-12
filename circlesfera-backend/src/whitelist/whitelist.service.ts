import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { CreateWhitelistEntryDto } from './dto/create-whitelist-entry.dto.js';

@Injectable()
export class WhitelistService {
  private readonly logger = new Logger(WhitelistService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EmailService) private emailService: EmailService,
  ) {}

  async create(createWhitelistEntryDto: CreateWhitelistEntryDto) {
    const { email, name } = createWhitelistEntryDto;

    // Check if email already exists
    const existing = await this.prisma.whitelistEntry.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email already in whitelist');
    }

    const entry = await this.prisma.whitelistEntry.create({
      data: {
        email,
        name,
        status: 'VALID',
      },
    });

    // Send welcome email asynchronously
    try {
      await this.emailService.sendWelcomeEmail(email, name || 'Amigo');
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}`, error);
      // We don't throw here to avoid failing the signup if only email fails
    }

    return entry;
  }

  async findAll() {
    return await this.prisma.whitelistEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
