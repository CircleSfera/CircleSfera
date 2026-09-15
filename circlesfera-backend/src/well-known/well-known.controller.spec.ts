import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createControllerApp } from '../common/testing/http-controller.js';
import { WellKnownController } from './well-known.controller.js';

describe('WellKnownController', () => {
  let app: INestApplication;

  const mockConfig = {
    get: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [WellKnownController],
      providers: [{ provide: ConfigService, useValue: mockConfig }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the Apple app site association', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/.well-known/apple-app-site-association')
      .expect(200);

    expect(res.body).toEqual({
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

  it('returns Android asset links with the configured fingerprint', async () => {
    mockConfig.get.mockReturnValue('aa:bb:cc');

    const res = await request(app.getHttpServer())
      .get('/api/v1/.well-known/assetlinks.json')
      .expect(200);

    expect(res.body).toEqual([
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

  it('returns Android asset links with an empty fingerprint list when unset', async () => {
    mockConfig.get.mockReturnValue(undefined);

    const res = await request(app.getHttpServer())
      .get('/api/v1/.well-known/assetlinks.json')
      .expect(200);

    expect(res.body[0]?.target.sha256_cert_fingerprints).toEqual([]);
  });
});
