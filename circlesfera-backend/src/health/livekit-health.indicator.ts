import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { liveKitApiUrl } from '../live/livekit-api-url.js';

/** How long the live service has to answer before it counts as down. */
export const LIVEKIT_HEALTH_TIMEOUT_MS = 3000;

/** What the live service answers a sign-in check without a token. */
export const LIVEKIT_UNSIGNED_STATUS = 401;

// Asks the live service to check a sign-in without a token: only the live
// service answers 401 there. Its root path is not used, because where the
// live service sits under the site's own address, the root is the web app,
// which answers 200 even when the live service is down. The answer says only
// up or down, with a fixed reason: the service's address and any error text
// stay inside the server, since the health address is public.
@Injectable()
export class LiveKitHealthIndicator {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(HealthIndicatorService)
    private readonly healthIndicator: HealthIndicatorService,
  ) {}

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicator.check(key);
    const url = liveKitApiUrl(this.config);
    if (!url) return indicator.down({ message: 'not configured' });
    try {
      const response = await fetch(`${url.replace(/\/+$/, '')}/rtc/validate`, {
        signal: AbortSignal.timeout(LIVEKIT_HEALTH_TIMEOUT_MS),
      });
      return response.status === LIVEKIT_UNSIGNED_STATUS
        ? indicator.up()
        : indicator.down({ message: `answered ${response.status}` });
    } catch {
      return indicator.down({ message: 'unreachable' });
    }
  }
}
