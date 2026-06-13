import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebrtcService } from './webrtc.service.js';
import { vi } from 'vitest';

describe('WebrtcService', () => {
  let service: WebrtcService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebrtcService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebrtcService>(WebrtcService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
