import { Test, type TestingModule } from '@nestjs/testing';
import { WebrtcController } from './webrtc.controller.js';
import { WebrtcService } from './webrtc.service.js';
import { vi } from 'vitest';

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
