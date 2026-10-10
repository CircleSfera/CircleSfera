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
import { HelpdeskDataPort } from '../helpdesk/helpdesk-data.port.js';
import {
  BrevoInboundController,
  bearerToken,
  fromBrevo,
  InboundTokenGuard,
} from './brevo-inbound.controller.js';

// The email of the provider's own documentation, as it posts it.
const documented = {
  Uuid: ['8d79f202-fb1f-4b6c-8a6f-d9f7b9e0b5a1'],
  MessageId: '<CAHk-=abc123@mail.gmail.com>',
  InReplyTo: '<202610090000.1@circlesfera.com>',
  From: { Name: 'Ana López', Address: 'ana@example.com' },
  To: [
    {
      Name: 'CircleSfera',
      Address: 'ticket+1042.0123456789abcdef@reply.example.com',
    },
  ],
  Recipients: ['ticket+1042.0123456789abcdef@reply.example.com'],
  Cc: [{ Name: 'Bea', Address: 'bea@example.com' }],
  ReplyTo: null,
  SentAtDate: 'Fri, 09 Oct 2026 10:00:00 +0200',
  Subject: 'Re: Help',
  RawHtmlBody: '<p>With BBVA.</p><blockquote>earlier</blockquote>',
  RawTextBody: 'With BBVA.\n\nOn Fri, CircleSfera wrote:\n> earlier',
  ExtractedMarkdownMessage: 'With BBVA.',
  ExtractedMarkdownSignature: 'Ana',
  Spam: { Score: 1.4 },
  Attachments: [
    {
      Name: 'receipt.pdf',
      ContentType: 'application/pdf',
      ContentLength: 1000,
      ContentID: 'a',
      DownloadToken: 'secret-download-token',
    },
  ],
  Headers: { 'Auto-Submitted': 'no', Received: ['a', 'b'] },
};

describe('the email the provider posts, in the words of the Help Desk', () => {
  it('maps every field the Help Desk uses, and takes the text already cut', () => {
    expect(fromBrevo(documented)).toEqual({
      messageId: '<CAHk-=abc123@mail.gmail.com>',
      from: 'ana@example.com',
      to: [
        'ticket+1042.0123456789abcdef@reply.example.com',
        'ticket+1042.0123456789abcdef@reply.example.com',
        'bea@example.com',
      ],
      subject: 'Re: Help',
      text: 'With BBVA.',
      spamScore: 1.4,
      attachmentCount: 1,
      headers: documented.Headers,
    });
  });

  it('falls back to the plain text, and to the other place the score may be', () => {
    const mapped = fromBrevo({
      ...documented,
      ExtractedMarkdownMessage: '',
      Spam: undefined,
      SpamScore: 7.5,
    });

    expect(mapped?.text).toBe(documented.RawTextBody);
    expect(mapped?.spamScore).toBe(7.5);
  });

  it('survives an email with almost nothing, and ignores one without a sender', () => {
    expect(fromBrevo({ From: { Address: 'x@example.com' } })).toEqual({
      messageId: null,
      from: 'x@example.com',
      to: [],
      subject: '',
      text: '',
      spamScore: null,
      attachmentCount: 0,
      headers: {},
    });
    expect(fromBrevo({ Subject: 'no sender' })).toBeNull();
    expect(
      fromBrevo({ From: null, To: 'not a list', Headers: 'x' }),
    ).toBeNull();
  });
});

describe('BrevoInboundController', () => {
  let app: INestApplication;
  const settings: Record<string, string | undefined> = {};
  const helpdesk = { emailInEnabled: vi.fn(), receiveEmail: vi.fn() };
  const post = (token?: string) => {
    const call = request(app.getHttpServer()).post(
      '/api/v1/helpdesk/inbound/email',
    );
    return token === undefined ? call : call.set('Authorization', token);
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [BrevoInboundController],
      providers: [
        InboundTokenGuard,
        { provide: HelpdeskDataPort, useValue: helpdesk },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => settings[key] },
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    settings.HELPDESK_INBOUND_TOKEN = 'the-token-the-provider-sends';
    helpdesk.emailInEnabled.mockReturnValue(true);
    helpdesk.receiveEmail.mockResolvedValue({ id: 'i-1', kept: true });
  });

  it('keeps each email of a call that carries the token', async () => {
    const res = await post('Bearer the-token-the-provider-sends')
      .send({ items: [documented, { ...documented, MessageId: '<2@x>' }] })
      .expect(200);

    expect(res.body).toEqual({ received: 2 });
    expect(helpdesk.receiveEmail).toHaveBeenCalledTimes(2);
    expect(helpdesk.receiveEmail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'ana@example.com', text: 'With BBVA.' }),
    );
  });

  it.each([
    ['no token', undefined],
    ['a wrong token', 'Bearer something-else'],
    ['the token without its scheme', 'the-token-the-provider-sends'],
    ['the token as another scheme', 'Basic the-token-the-provider-sends'],
    [
      'a token that only starts alike',
      'Bearer the-token-the-provider-sends-and-more',
    ],
    ['an empty bearer', 'Bearer '],
    ['the token stuck to its scheme', 'Bearerthe-token-the-provider-sends'],
  ])(
    'refuses a call with %s, and reads nothing of it',
    async (_case, token) => {
      await post(token)
        .send({ items: [documented] })
        .expect(401);

      expect(helpdesk.receiveEmail).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['in any letter case', 'bEaReR the-token-the-provider-sends'],
    ['after several spaces', 'Bearer    the-token-the-provider-sends'],
  ])('reads the token with its scheme %s', async (_case, token) => {
    await post(token)
      .send({ items: [documented] })
      .expect(200);
  });

  it('reads a very long header of spaces without slowing down', () => {
    const started = performance.now();
    expect(bearerToken(`Bearer ${' '.repeat(200_000)}`)).toBe('');
    expect(bearerToken(`Bearer ${' '.repeat(200_000)}x`)).toBe('x');
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('does not exist while email in is not set up, even with the right token', async () => {
    helpdesk.emailInEnabled.mockReturnValue(false);
    await post('Bearer the-token-the-provider-sends')
      .send({ items: [documented] })
      .expect(404);

    helpdesk.emailInEnabled.mockReturnValue(true);
    settings.HELPDESK_INBOUND_TOKEN = '  ';
    await post('Bearer ')
      .send({ items: [documented] })
      .expect(404);
    settings.HELPDESK_INBOUND_TOKEN = undefined;
    await post('Bearer undefined')
      .send({ items: [documented] })
      .expect(404);

    expect(helpdesk.receiveEmail).not.toHaveBeenCalled();
  });

  it('answers a call with nothing usable in it without keeping anything', async () => {
    for (const body of [
      {},
      { items: 'x' },
      { items: [null, 'x', { Subject: 'no sender' }] },
    ]) {
      const res = await post('Bearer the-token-the-provider-sends')
        .send(body)
        .expect(200);
      expect(res.body).toEqual({ received: 0 });
    }
    expect(helpdesk.receiveEmail).not.toHaveBeenCalled();
  });

  it('takes at most fifty emails of one call', async () => {
    const items = Array.from({ length: 60 }, (_, n) => ({
      ...documented,
      MessageId: `<${n}@x>`,
    }));

    const res = await post('Bearer the-token-the-provider-sends')
      .send({ items })
      .expect(200);

    expect(res.body).toEqual({ received: 50 });
  });

  it('logs the id of what it kept and nothing a sender wrote', async () => {
    const { Logger } = await import('@nestjs/common');
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    helpdesk.receiveEmail
      .mockResolvedValueOnce({ id: 'i-1', kept: true })
      .mockResolvedValueOnce({ id: 'i-1', kept: false });

    await post('Bearer the-token-the-provider-sends')
      .send({ items: [documented, documented] })
      .expect(200);

    const lines = log.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.startsWith('Email '));
    expect(lines).toEqual(['Email i-1 kept', 'Email i-1 already kept']);
    expect(lines.join(' ')).not.toMatch(/ana@example\.com|BBVA|Re: Help/);
    log.mockRestore();
  });
});
