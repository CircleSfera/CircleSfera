import { beforeEach, describe, expect, it } from 'vitest';
import { HelpdeskStore } from './helpdesk.store.js';
import { isAutomatedMail } from './helpdesk-inbound.js';
import { HelpdeskInboundService } from './helpdesk-inbound.service.js';
import { HelpdeskReplyAddress } from './helpdesk-reply-address.js';
import { InMemoryHelpdeskDb } from './testing/in-memory-helpdesk-db.js';

// Email that arrives, kept on rows in memory behind the real store.
describe('Help Desk: keeping email that arrives', () => {
  let db: InMemoryHelpdeskDb;
  let organization: string;
  let inbound: HelpdeskInboundService;
  const settings: Record<string, string> = {
    HELPDESK_REPLY_DOMAIN: 'reply.example.com',
    HELPDESK_REPLY_SECRET: 'secret',
  };
  const email = {
    messageId: ' <abc@mail.example.com> ',
    from: ' Ana@Example.com ',
    to: ['Someone@else.com', 'Ticket+7.0123456789abcdef@Reply.Example.com'],
    subject: '  Re: Help  ',
    text: '  The one I wrote from.  ',
    spamScore: 1.2,
    attachmentCount: 2,
    headers: {},
  };

  beforeEach(() => {
    db = new InMemoryHelpdeskDb();
    organization = 'org-a';
    const scope = { current: () => organization };
    inbound = new HelpdeskInboundService(
      new HelpdeskStore(db as never, scope),
      new HelpdeskReplyAddress(
        { get: (key: string) => settings[key] } as never,
        scope,
      ),
    );
  });

  it('keeps what matters of an email, tidy, addressed to the reply address', async () => {
    const { id, kept } = await inbound.receive(email);

    expect(kept).toBe(true);
    expect(db.inboundEmails).toEqual([
      expect.objectContaining({
        id,
        organizationId: 'org-a',
        messageId: '<abc@mail.example.com>',
        fromAddress: 'ana@example.com',
        toAddress: 'ticket+7.0123456789abcdef@reply.example.com',
        subject: 'Re: Help',
        body: 'The one I wrote from.',
        spamScore: 1.2,
        attachmentCount: 2,
        automated: false,
        outcome: 'RECEIVED',
        ticketId: null,
      }),
    ]);
  });

  it('keeps the same email once, however many times it is delivered', async () => {
    const first = await inbound.receive(email);
    const again = await inbound.receive({
      ...email,
      text: 'changed on the way',
    });

    expect(again).toEqual({ id: first.id, kept: false });
    expect(db.inboundEmails).toHaveLength(1);
    expect(db.inboundEmails[0].body).toBe('The one I wrote from.');
  });

  it('keeps it once when it is delivered twice at the same moment', async () => {
    const [one, two] = await Promise.all([
      inbound.receive(email),
      inbound.receive(email),
    ]);

    expect(one.id).toBe(two.id);
    expect([one.kept, two.kept].sort()).toEqual([false, true]);
    expect(db.inboundEmails).toHaveLength(1);
  });

  it('tells emails without a Message-ID apart by what they say', async () => {
    const bare = { ...email, messageId: null };

    const first = await inbound.receive(bare);
    const same = await inbound.receive(bare);
    const other = await inbound.receive({ ...bare, text: 'Another answer' });

    expect(same.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
    expect(db.inboundEmails[0].messageId).toMatch(/^no-id:[0-9a-f]{64}$/);
  });

  it('keeps an email with almost nothing in it, and bounds what it keeps', async () => {
    await inbound.receive({ from: 'x@example.com', to: [] });
    await inbound.receive({
      messageId: 'm'.repeat(900),
      from: 'x@example.com',
      to: ['not-a-reply@example.com'],
      subject: 's'.repeat(900),
      text: 't'.repeat(30_000),
      spamScore: Number.NaN,
      attachmentCount: -3,
    });

    expect(db.inboundEmails[0]).toMatchObject({
      toAddress: '',
      subject: '',
      body: '',
      spamScore: null,
      attachmentCount: 0,
    });
    expect(db.inboundEmails[1]).toMatchObject({
      toAddress: 'not-a-reply@example.com',
      spamScore: null,
      attachmentCount: 0,
    });
    expect((db.inboundEmails[1].messageId as string).length).toBe(500);
    expect((db.inboundEmails[1].subject as string).length).toBe(500);
    expect((db.inboundEmails[1].body as string).length).toBe(20_000);
  });

  it('marks mail a machine sent', async () => {
    await inbound.receive({
      ...email,
      headers: { 'Auto-Submitted': 'auto-replied' },
    });

    expect(db.inboundEmails[0].automated).toBe(true);
  });

  it('deletes what was kept for more than thirty days, in its organization only', async () => {
    await inbound.receive(email);
    organization = 'org-b';
    // The same Message-ID is another email in another organization.
    expect((await inbound.receive(email)).kept).toBe(true);
    for (const kept of db.inboundEmails) {
      kept.receivedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    }
    await inbound.receive({ ...email, messageId: '<recent@mail.example.com>' });
    // Rows are dated by the clock of the test database: this one is of today.
    (db.inboundEmails.at(-1) as { receivedAt: Date }).receivedAt = new Date();

    expect(await inbound.deleteOld()).toBe(1);

    expect(
      db.inboundEmails.map((e) => [e.organizationId, e.messageId]),
    ).toEqual([
      ['org-a', '<abc@mail.example.com>'],
      ['org-b', '<recent@mail.example.com>'],
    ]);
  });

  it('says whether email in is set up', () => {
    expect(inbound.enabled).toBe(true);
  });

  describe('mail a machine sent', () => {
    const from = (address: string, headers: Record<string, unknown> = {}) =>
      isAutomatedMail({ from: address, to: [], headers });

    it.each([
      ['an out-of-office answer', { 'Auto-Submitted': 'auto-replied' }],
      ['a generated notice', { 'auto-submitted': 'auto-generated' }],
      ['bulk mail', { Precedence: 'bulk' }],
      ['a list', { Precedence: ['list'] }],
      ['a list by its id', { 'List-Id': '<news.example.com>' }],
      [
        'a list by its unsubscribe',
        { 'List-Unsubscribe': '<mailto:x@example.com>' },
      ],
      ['an autoreply mark', { 'X-Autoreply': 'yes' }],
      ['a suppression mark', { 'X-Auto-Response-Suppress': 'All' }],
    ])('recognises %s', (_case, headers) => {
      expect(from('ana@example.com', headers)).toBe(true);
    });

    it.each([
      'MAILER-DAEMON@mail.example.com',
      'postmaster@example.com',
      'no-reply@example.com',
      'noreply+abc@example.com',
      'bounce-123@example.com',
      'bounces@example.com',
    ])('recognises the sender %s', (address) => {
      expect(from(address)).toBe(true);
    });

    it('does not take a person for a machine', () => {
      expect(from('ana@example.com')).toBe(false);
      expect(from('ana@example.com', { 'Auto-Submitted': 'no' })).toBe(false);
      expect(
        from('ana@example.com', { Precedence: 'normal', Subject: 'Hi' }),
      ).toBe(false);
      expect(from('noreplying.ana@example.com')).toBe(false);
      expect(isAutomatedMail({ from: 'ana@example.com', to: [] })).toBe(false);
      expect(from('ana@example.com', { 'X-Autoreply': null })).toBe(false);
    });
  });
});
