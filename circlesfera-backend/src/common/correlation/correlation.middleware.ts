import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CorrelationContext } from './correlation.context.js';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawHeader =
      req.headers['x-correlation-id'] || req.headers['x-request-id'];

    const correlationId =
      typeof rawHeader === 'string' && rawHeader.trim() !== ''
        ? rawHeader.trim()
        : CorrelationContext.generateId();

    // Standardize correlation headers on both incoming request and outgoing response
    req.headers['x-correlation-id'] = correlationId;
    req.headers['x-request-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    res.setHeader('x-request-id', correlationId);

    CorrelationContext.run(correlationId, () => {
      next();
    });
  }
}
