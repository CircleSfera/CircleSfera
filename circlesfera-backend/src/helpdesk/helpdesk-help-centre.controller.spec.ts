import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
import { STAFF_PERMISSIONS_KEY } from '../auth/guards/admin.guard.js';
import { createControllerApp } from '../common/testing/http-controller.js';
import { HelpdeskHelpCentreController } from './helpdesk-help-centre.controller.js';
import { HelpdeskHelpCentreService } from './helpdesk-help-centre.service.js';

describe('HelpdeskHelpCentreController', () => {
  let app: INestApplication;
  const service = { list: vi.fn(), article: vi.fn() };
  const base = '/api/v1/help/articles';

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [HelpdeskHelpCentreController],
      providers: [{ provide: HelpdeskHelpCentreService, useValue: service }],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    service.list.mockResolvedValue({ locale: 'es', articles: [] });
    service.article.mockResolvedValue({ slug: 'refunds' });
  });

  it('is read by anyone, with no session and no staff permission', async () => {
    expect(
      new Reflector().get(STAFF_PERMISSIONS_KEY, HelpdeskHelpCentreController),
    ).toBeUndefined();

    await request(app.getHttpServer()).get(base).expect(200);
    await request(app.getHttpServer()).get(`${base}/refunds`).expect(200);
  });

  it('passes on the language, the words and the topic of the reader', async () => {
    await request(app.getHttpServer())
      .get(`${base}?locale=es-ES&q=reembolso&topic=PAYMENTS`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/refunds?locale=en`)
      .expect(200);

    expect(service.list).toHaveBeenCalledWith({
      locale: 'es-ES',
      q: 'reembolso',
      topic: 'PAYMENTS',
    });
    expect(service.article).toHaveBeenCalledWith('refunds', 'en');
  });

  it.each([
    ['a topic that does not exist', '?topic=BILLING'],
    ['a search over 100 characters', `?q=${'x'.repeat(101)}`],
    ['a language over 10 characters', '?locale=espanol-de-espana'],
    ['an organization', '?organizationId=other'],
    ['a state', '?status=DRAFT'],
  ])('rejects a request with %s', async (_case, query) => {
    await request(app.getHttpServer()).get(`${base}${query}`).expect(400);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('has no way to write: the routes of who writes articles are not here', async () => {
    await request(app.getHttpServer()).post(base).send({}).expect(404);
    await request(app.getHttpServer())
      .patch(`${base}/refunds`)
      .send({})
      .expect(404);
    await request(app.getHttpServer()).delete(`${base}/refunds`).expect(404);
  });
});
