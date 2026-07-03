import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppService } from './app.service.js';
import { ChatService } from './chat/chat.service.js';
import { generateCsrfToken } from './common/config/csrf.config.js';
import { PrismaService } from './prisma/prisma.service.js';

/** Root controller providing the health-check and security endpoints. */
@Controller()
export class AppController {
  constructor(
    @Inject(AppService) private readonly appService: AppService,
    @Inject(ChatService) private readonly chatService: ChatService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Health-check: returns a greeting string from AppService. */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** GET /csrf-token: Generates and returns a CSRF token for the frontend. */
  @Get('csrf-token')
  getCsrfToken(@Req() req: Request, @Res() res: Response): void {
    const token = generateCsrfToken(req, res);
    res.json({ csrfToken: token });
  }

  /** Debug endpoint: Runs unread count and returns error trace if it fails. */
  @Get('debug/chat-error')
  async debugChat(@Req() req: Request) {
    const userId = req.query.userId as string;
    if (!userId) {
      return { error: 'Please provide userId in query param' };
    }
    try {
      const result = await this.chatService.getUnreadCount(userId);
      return { success: true, result };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        stack: err.stack,
      };
    }
  }

  /** Debug endpoint: Lookup user by username. */
  @Get('debug/user')
  async debugUser(@Req() req: Request) {
    const username = req.query.username as string;
    if (!username) {
      return { error: 'Please provide username in query param' };
    }
    try {
      const user = await this.prisma.user.findFirst({
        where: { profile: { username } },
        include: { profile: true },
      });
      return user;
    } catch (err: any) {
      return { error: err.message };
    }
  }
}
