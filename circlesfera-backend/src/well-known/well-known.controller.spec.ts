import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WellKnownController } from './well-known.controller.js';

describe('WellKnownController', () => {
  let controller: WellKnownController;

  const mockConfig = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WellKnownController],
      providers: [{ provide: ConfigService, useValue: mockConfig }],
    }).compile();

    controller = module.get<WellKnownController>(WellKnownController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns the Apple app site association', () => {
    expect(controller.getAppleAppSiteAssociation()).toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appID: '784H5W6YA8.com.circlesfera.app',
            paths: ['*'],
          },
        ],
      },
    });
  });

  it('returns Android asset links with the configured fingerprint', () => {
    mockConfig.get.mockReturnValue('aa:bb:cc');

    expect(controller.getAssetLinks()).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.circlesfera.app',
          sha256_cert_fingerprints: ['aa:bb:cc'],
        },
      },
    ]);
    expect(mockConfig.get).toHaveBeenCalledWith('ANDROID_SHA256');
  });

  it('returns Android asset links with an empty fingerprint list when unset', () => {
    mockConfig.get.mockReturnValue(undefined);

    const [entry] = controller.getAssetLinks();

    expect(entry?.target.sha256_cert_fingerprints).toEqual([]);
  });
});
