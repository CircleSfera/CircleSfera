import { Test, TestingModule } from '@nestjs/testing';
import { WebrtcController } from './webrtc.controller';

describe('WebrtcController', () => {
  let controller: WebrtcController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebrtcController],
    }).compile();

    controller = module.get<WebrtcController>(WebrtcController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
