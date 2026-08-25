import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * HMAC-SHA256 hashes for abuse clustering. Never log or return the preimage.
 */
@Injectable()
export class AbuseHashService {
  private readonly pepper: string | null;

  constructor(config: ConfigService) {
    const pepper = config.get<string>('ABUSE_HASH_PEPPER')?.trim() || '';
    this.pepper =
      pepper && !pepper.includes('CHANGE_ME') && !pepper.includes('dummy')
        ? pepper
        : null;
  }

  isConfigured(): boolean {
    return !!this.pepper;
  }

  hash(value: string | null | undefined): string | null {
    if (!this.pepper || !value?.trim()) return null;
    return createHmac('sha256', this.pepper).update(value.trim()).digest('hex');
  }
}
