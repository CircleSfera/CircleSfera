import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type App, cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface NativePush {
  title: string;
  body: string;
  // Values must be strings: Firebase carries data as a map of strings.
  data?: Record<string, string>;
}

// Errors with which Firebase says a token no longer reaches a device.
const GONE = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Sends push to the native apps through Firebase Cloud Messaging (Android,
 * and iOS through the APNs key held by Firebase). Off while the server has no
 * service account: FIREBASE_SERVICE_ACCOUNT, the JSON key in base64.
 */
@Injectable()
export class FcmSender {
  private readonly logger = new Logger(FcmSender.name);
  private app: App | null | undefined;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  private firebase(): App | null {
    if (this.app !== undefined) return this.app;
    const encoded = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');
    if (!encoded) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT missing: push to the native apps is off.',
      );
      this.app = null;
      return null;
    }
    try {
      const account = JSON.parse(
        Buffer.from(encoded, 'base64').toString('utf8'),
      );
      this.app = initializeApp({ credential: cert(account) }, 'native-push');
    } catch {
      // The key itself is never logged.
      this.logger.error(
        'FIREBASE_SERVICE_ACCOUNT could not be read: push to the native apps is off.',
      );
      this.app = null;
    }
    return this.app;
  }

  /** Sends to the tokens; answers the ones that no longer reach a device. */
  async send(tokens: string[], push: NativePush): Promise<string[]> {
    const app = this.firebase();
    if (!app || tokens.length === 0) return [];
    const answer = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: push.title, body: push.body },
      data: push.data,
    });
    const gone: string[] = [];
    answer.responses.forEach((r, i) => {
      if (r.success) return;
      if (r.error && GONE.has(r.error.code)) gone.push(tokens[i]);
      else
        this.logger.warn(`Native push failed: ${r.error?.code ?? 'unknown'}`);
    });
    return gone;
  }
}
