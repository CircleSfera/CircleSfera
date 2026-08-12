import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SYSTEM_SETTING_KEYS } from './system-settings.constants.js';
import { SystemSettingsService } from './system-settings.service.js';

const EXEMPT_PREFIXES = [
  '/api/v1/health',
  '/api/v1/csrf-token',
  '/api/v1/admin-auth',
  '/api/v1/admin',
  '/api/v1/payments/webhook',
] as const;

@Injectable()
export class MaintenanceModeGuard implements CanActivate {
  constructor(private readonly systemSettings: SystemSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const path = (req.originalUrl || req.url || '').split('?')[0];

    if (EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return true;
    }

    const maintenance = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.MAINTENANCE_MODE,
    );
    if (maintenance) {
      throw new ServiceUnavailableException('MAINTENANCE_MODE');
    }

    return true;
  }
}
