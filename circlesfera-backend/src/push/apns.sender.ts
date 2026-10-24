import { createPrivateKey, type KeyObject, sign } from 'node:crypto';
import http2 from 'node:http2';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NativePush {
  title: string;
  body: string;
  // Extra keys next to `aps`, read by the app when the notice is opened.
  data?: Record<string, string>;
}

// The bundle identifier of the iOS app: Apple delivers to it.
const TOPIC = 'com.circlesfera.app';
// Apple refuses a signing token older than an hour and asks that a new one
// be made at most every 20 minutes.
const TOKEN_LIFETIME_MS = 50 * 60 * 1000;
const TOKEN_MIN_AGE_MS = 20 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
// A device token is hexadecimal; anything else never reaches the URL.
const DEVICE_TOKEN = /^[0-9a-f]+$/i;

interface Credentials {
  key: KeyObject;
  keyId: string;
  teamId: string;
  origin: string;
}

const base64url = (value: Buffer | string) =>
  Buffer.from(value).toString('base64url');

/**
 * Sends push to the iOS app through the Apple Push Notification service
 * itself, over HTTP/2, signed with the account's token key (.p8). Off while
 * the server lacks APNS_KEY (the .p8 in base64), APNS_KEY_ID or
 * APNS_TEAM_ID. APNS_SANDBOX=true sends to Apple's development service, for
 * builds run from Xcode.
 */
@Injectable()
export class ApnsSender implements OnModuleDestroy {
  private readonly logger = new Logger(ApnsSender.name);
  private credentials: Credentials | null | undefined;
  private session: http2.ClientHttp2Session | null = null;
  private jwt: { value: string; madeAt: number } | null = null;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  private apple(): Credentials | null {
    if (this.credentials !== undefined) return this.credentials;
    const encoded = this.configService.get<string>('APNS_KEY');
    const keyId = this.configService.get<string>('APNS_KEY_ID');
    const teamId = this.configService.get<string>('APNS_TEAM_ID');
    if (!encoded || !keyId || !teamId) {
      this.logger.warn(
        'APNS_KEY, APNS_KEY_ID or APNS_TEAM_ID missing: push to the iOS app is off.',
      );
      this.credentials = null;
      return null;
    }
    try {
      const key = createPrivateKey(
        Buffer.from(encoded, 'base64').toString('utf8'),
      );
      const sandbox = this.configService.get<string>('APNS_SANDBOX') === 'true';
      this.credentials = {
        key,
        keyId,
        teamId,
        origin: sandbox
          ? 'https://api.sandbox.push.apple.com'
          : 'https://api.push.apple.com',
      };
    } catch {
      // The key itself is never logged.
      this.logger.error(
        'APNS_KEY could not be read: push to the iOS app is off.',
      );
      this.credentials = null;
    }
    return this.credentials;
  }

  // The provider token: a JWT signed ES256 with the account's key.
  private providerToken(apple: Credentials, now: number): string {
    if (this.jwt && now - this.jwt.madeAt < TOKEN_LIFETIME_MS) {
      return this.jwt.value;
    }
    const header = base64url(
      JSON.stringify({ alg: 'ES256', kid: apple.keyId }),
    );
    const claims = base64url(
      JSON.stringify({ iss: apple.teamId, iat: Math.floor(now / 1000) }),
    );
    const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
      key: apple.key,
      dsaEncoding: 'ieee-p1363',
    });
    this.jwt = {
      value: `${header}.${claims}.${base64url(signature)}`,
      madeAt: now,
    };
    return this.jwt.value;
  }

  // One connection, kept open for every send, as Apple asks.
  private connection(apple: Credentials): http2.ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) {
      return this.session;
    }
    const session = http2.connect(apple.origin);
    session.on('error', () => {
      if (this.session === session) this.session = null;
    });
    session.on('close', () => {
      if (this.session === session) this.session = null;
    });
    this.session = session;
    return session;
  }

  private post(
    apple: Credentials,
    token: string,
    payload: string,
  ): Promise<{ status: number; reason?: string }> {
    return new Promise((resolve, reject) => {
      const session = this.connection(apple);
      const request = session.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${this.providerToken(apple, Date.now())}`,
        'apns-topic': TOPIC,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let status = 0;
      let body = '';
      request.setEncoding('utf8');
      // No answer in time: the connection may be dead without knowing it (a
      // network that drops idle connections), so the next send opens another.
      // close(), not destroy(): the other devices' requests on it finish, or
      // reach their own timeout, before it goes.
      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.close(http2.constants.NGHTTP2_CANCEL);
        if (this.session === session) this.session = null;
        session.close();
      });
      request.on('response', (headers) => {
        status = Number(headers[':status']);
      });
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => {
        let reason: string | undefined;
        try {
          reason = body ? JSON.parse(body).reason : undefined;
        } catch {
          reason = undefined;
        }
        resolve({ status, reason });
      });
      request.on('error', reject);
      // Cancelled on the timeout, or the connection went: no answer.
      request.on('close', () => resolve({ status, reason: 'NoAnswer' }));
      request.end(payload);
    });
  }

  /** Sends to the tokens; answers the ones that no longer reach a device. */
  async send(tokens: string[], push: NativePush): Promise<string[]> {
    const apple = this.apple();
    if (!apple || tokens.length === 0) return [];
    const { aps: _ignored, ...data } = push.data ?? {};
    const payload = JSON.stringify({
      ...data,
      aps: { alert: { title: push.title, body: push.body }, sound: 'default' },
    });
    const gone: string[] = [];
    await Promise.all(
      tokens.map(async (token) => {
        if (!DEVICE_TOKEN.test(token)) {
          gone.push(token);
          return;
        }
        try {
          const answer = await this.post(apple, token, payload);
          if (answer.status === 200) return;
          // 410: the app was removed or the device stopped taking push.
          if (answer.status === 410) {
            gone.push(token);
            return;
          }
          // Apple refuses new signing tokens made more often than every 20
          // minutes, so an expired one is replaced only once it is that old.
          if (
            answer.reason === 'ExpiredProviderToken' &&
            this.jwt &&
            Date.now() - this.jwt.madeAt >= TOKEN_MIN_AGE_MS
          ) {
            this.jwt = null;
          }
          this.logger.warn(
            `iOS push refused: ${answer.status} ${answer.reason ?? 'no reason'}`,
          );
        } catch (error) {
          this.logger.warn(
            `iOS push failed: ${(error as { code?: string }).code ?? 'unknown'}`,
          );
        }
      }),
    );
    return gone;
  }

  onModuleDestroy() {
    this.session?.close();
    this.session = null;
  }
}
