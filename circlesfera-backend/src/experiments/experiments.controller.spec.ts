import { Test, TestingModule } from '@nestjs/testing';
import { ExperimentsController } from './experiments.controller.js';
import { ExperimentsService } from './experiments.service.js';

describe('ExperimentsController', () => {
  let controller: ExperimentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExperimentsController],
      providers: [{ provide: ExperimentsService, useValue: {} }],
    }).compile();

    controller = module.get<ExperimentsController>(ExperimentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
