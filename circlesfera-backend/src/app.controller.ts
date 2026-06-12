import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppService } from './app.service.js';
import { generateCsrfToken } from './common/config/csrf.config.js';

/** Root controller providing the health-check and security endpoints. */
@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

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
}
