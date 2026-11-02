import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';

// How long a token may be used to join a room. The live service checks a
// token only when someone joins: whoever is connected stays connected after
// it passes, and the service itself hands connected clients fresh tokens for
// reconnecting. The app asks for a token right before it joins, so a short
// life is enough, and a token kept after the server ended a broadcast,
// removed a co-host or sanctioned a host is soon of no use.
export const JOIN_TOKEN_TTL_SECONDS = 5 * 60;

@Injectable()
export class LiveKitTokenService {
  constructor(private configService: ConfigService) {}

  async createToken(
    roomName: string,
    participantName: string,
    isHost: boolean,
  ) {
    const isProd = this.configService.get('NODE_ENV') === 'production';
    const apiKey =
      this.configService.get<string>('LIVEKIT_API_KEY') ||
      (isProd ? '' : 'devkey');
    const apiSecret =
      this.configService.get<string>('LIVEKIT_API_SECRET') ||
      (isProd ? '' : 'secret');

    if (!apiKey || !apiSecret) {
      if (isProd) {
        throw new Error(
          'SECURITY ALERT: LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production.',
        );
      }
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      ttl: JOIN_TOKEN_TTL_SECONDS,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: isHost,
      canSubscribe: true,
    });

    return await at.toJwt();
  }
}
