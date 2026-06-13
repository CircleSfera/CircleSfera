import { Injectable, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WebrtcService {
  private readonly logger = new Logger(WebrtcService.name);

  constructor(private configService: ConfigService) {}

  async getIceServers() {
    const domain = this.configService.get<string>('METERED_DOMAIN');
    const secretKey = this.configService.get<string>('METERED_SECRET_KEY');

    const fallbackIceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    if (!domain || !secretKey) {
      this.logger.warn('Metered.ca credentials not found, using fallback STUN servers');
      return fallbackIceServers;
    }

    try {
      // Metered.ca API format: https://<domain>/api/v1/turn/credentials?apiKey=<key>
      const response = await axios.get(
        `https://${domain}/api/v1/turn/credentials?apiKey=${secretKey}`,
      );
      
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch TURN credentials from Metered.ca, using fallback', error);
      return fallbackIceServers;
    }
  }
}
