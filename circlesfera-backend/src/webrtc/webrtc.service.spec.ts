import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { WebrtcService } from './webrtc.service.js';

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
