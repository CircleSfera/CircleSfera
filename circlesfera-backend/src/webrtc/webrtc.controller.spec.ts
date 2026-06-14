import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { WebrtcController } from './webrtc.controller.js';
import { WebrtcService } from './webrtc.service.js';

describe('WebrtcController', () => {
  let controller: WebrtcController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebrtcController],
      providers: [
        {
          provide: WebrtcService,
          useValue: {
            getTurnCredentials: vi.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    controller = module.get<WebrtcController>(WebrtcController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
