import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';

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
