import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

/** Extract audit metadata from an Express request. */
export function adminAuditMetaFromRequest(req: Request): {
  ipAddress?: string;
  userAgent?: string;
  requestId: string;
} {
  const headerId = req.headers['x-request-id'];
  const requestId =
    (typeof headerId === 'string' && headerId) ||
    (req as Request & { id?: string }).id ||
    randomUUID();
  return {
    ipAddress: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
    requestId,
  };
}
