import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebrtcService } from './webrtc.service.js';

vi.mock('axios');

describe('WebrtcService', () => {
  let service: WebrtcService;
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebrtcService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<WebrtcService>(WebrtcService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getIceServers', () => {
    it('should return fallbackIceServers when credentials are not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const servers = await service.getIceServers();
      expect(servers).toEqual([
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]);
    });

    it('should fetch and return TURN credentials from Metered.ca when configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'METERED_DOMAIN') return 'test.metered.live';
        if (key === 'METERED_SECRET_KEY') return 'secret-key-123';
        return null;
      });

      const mockData = [
        { urls: 'turn:turn.metered.ca:443', username: 'u', credential: 'c' },
      ];
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockData });

      const servers = await service.getIceServers();
      expect(axios.get).toHaveBeenCalledWith(
        'https://test.metered.live/api/v1/turn/credentials?apiKey=secret-key-123',
        { timeout: 5_000 },
      );
      expect(servers).toEqual(mockData);
    });

    it('should return fallbackIceServers when Metered.ca call fails', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'METERED_DOMAIN') return 'test.metered.live';
        if (key === 'METERED_SECRET_KEY') return 'secret-key-123';
        return null;
      });

      vi.mocked(axios.get).mockRejectedValueOnce(new Error('Network error'));

      const servers = await service.getIceServers();
      expect(servers).toEqual([
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]);
    });
  });
});
