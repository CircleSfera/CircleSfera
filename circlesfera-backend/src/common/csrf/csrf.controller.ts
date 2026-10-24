import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { generateCsrfToken } from '../../common/config/csrf.config.js';

@Controller('csrf-token')
export class CsrfController {
  @Get()
  @ApiResponse({ status: 200 })
  getCsrfToken(@Req() req: Request, @Res() res: Response) {
    const token = generateCsrfToken(req, res);
    return res.json({ csrfToken: token });
  }
}
