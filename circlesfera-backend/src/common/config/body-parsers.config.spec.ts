import { Controller, type INestApplication, Post, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useBodyParsers } from './body-parsers.config.js';

type Received = { rawBody?: Buffer; body?: unknown };

@Controller()
class EchoController {
  @Post('api/v1/payments/webhook')
  webhook(@Req() req: Received) {
    return {
      rawBody: req.rawBody?.toString('utf8') ?? null,
      bodyIsBytes: Buffer.isBuffer(req.body),
    };
  }

  @Post('api/v1/other')
  other(@Req() req: Received) {
    return { rawBody: req.rawBody?.toString('utf8') ?? null, body: req.body };
  }
}

describe('useBodyParsers', () => {
  let app: INestApplication;

  // Booted as main.ts boots the server: Nest's own parsers on, then ours.
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EchoController],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: true, rawBody: true });
    useBodyParsers(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the exact bytes of a Stripe event, as its signature is checked against them', async () => {
    // Spacing as Stripe sends it: re-serialising would change the bytes.
    const event = '{\n  "id": "evt_1",\n  "object": "event"\n}';

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('content-type', 'application/json; charset=utf-8')
      .send(event)
      .expect(201);

    expect(res.body).toEqual({ rawBody: event, bodyIsBytes: true });
  });

  it('parses the JSON of any other route, and keeps its bytes too', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/other')
      .set('content-type', 'application/json')
      .send('{"a":1}')
      .expect(201);

    expect(res.body).toEqual({ rawBody: '{"a":1}', body: { a: 1 } });
  });

  it('keeps the bytes of a form post', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/other')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('command=%2Fstatus&text=hi')
      .expect(201);

    expect(res.body).toEqual({
      rawBody: 'command=%2Fstatus&text=hi',
      body: { command: '/status', text: 'hi' },
    });
  });
});
