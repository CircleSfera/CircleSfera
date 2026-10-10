import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskStore } from './helpdesk.store.js';
import { cutQuotedText } from './helpdesk-inbound.js';
import { HelpdeskInboundService } from './helpdesk-inbound.service.js';
import { HelpdeskReplyAddress } from './helpdesk-reply-address.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';
import { InMemoryHelpdeskDb } from './testing/in-memory-helpdesk-db.js';

// What becomes of an email that arrives: the real store, reply address,
// tickets service and inbound service, on rows in memory.
describe('Help Desk: matching an email to its ticket', () => {
  let db: InMemoryHelpdeskDb;
  let organization: string;
  let addresses: HelpdeskReplyAddress;
  let tickets: HelpdeskTicketsService;
  let inbound: HelpdeskInboundService;
  const notifier = {
    answer: vi.fn(),
    remind: vi.fn(),
    unmatchedSender: vi.fn(),
  };
  const teamChannel = {
    ticketOpened: vi.fn(),
    requesterReplied: vi.fn(),
    emailInTrouble: vi.fn(),
  };
  let ticketId: string;
  let address: string;
  let n = 0;

  const ticket = () => db.tickets.find((t) => t.id === ticketId);
  const messagesOf = (id: string) =>
    db.messages.filter((m) => m.ticketId === id);
  const email = (overrides: Record<string, unknown> = {}) => ({
    messageId: `<${++n}@mail.example.com>`,
    from: 'Ana@Example.com',
    to: [address],
    subject: 'Re: Help',
    text: 'With BBVA.',
    spamScore: 0.5,
    attachmentCount: 0,
    headers: {},
    ...overrides,
  });
  // Keeps an email and says what became of it.
  const arrive = async (overrides: Record<string, unknown> = {}) => {
    const { id } = await inbound.receive(email(overrides));
    return db.inboundEmails.find((e) => e.id === id) as Record<string, unknown>;
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    teamChannel.requesterReplied.mockResolvedValue(undefined);
    db = new InMemoryHelpdeskDb();
    organization = 'org-a';
    const scope = { current: () => organization };
    const store = new HelpdeskStore(db as never, scope);
    addresses = new HelpdeskReplyAddress(
      {
        get: (key: string) =>
          ({
            HELPDESK_REPLY_DOMAIN: 'reply.example.com',
            HELPDESK_REPLY_SECRET: 'secret',
          })[key],
      } as never,
      scope,
    );
    tickets = new HelpdeskTicketsService(
      store,
      { describe: vi.fn().mockResolvedValue(new Map()) },
      { accountCard: vi.fn() },
      {
        open: vi.fn(),
        withdraw: vi.fn(),
        cases: vi.fn().mockResolvedValue(new Map()),
      },
      notifier,
      teamChannel,
      { record: vi.fn() },
      { describe: vi.fn().mockResolvedValue(new Map()), assignable: vi.fn() },
      addresses,
    );
    inbound = new HelpdeskInboundService(
      store,
      addresses,
      tickets,
      notifier,
      teamChannel,
    );
    ticketId = (
      await tickets.createTicket({
        email: 'ana@example.com',
        subject: 'Help',
        message: 'I cannot get paid',
        userId: 'ana',
      })
    ).ticketId;
    address = addresses.for({ id: ticketId, reference: 1 }) as string;
    vi.clearAllMocks();
  });

  it('adds the answer of the requester to their ticket, marked as received by email, and tells the team', async () => {
    const kept = await arrive();

    expect(kept).toMatchObject({ outcome: 'MATCHED', ticketId });
    expect(messagesOf(ticketId).at(-1)).toMatchObject({
      authorKind: 'REQUESTER',
      authorRef: 'ana',
      visibility: 'PUBLIC',
      channel: 'EMAIL',
      body: 'With BBVA.',
    });
    expect(teamChannel.requesterReplied).toHaveBeenCalledTimes(1);
    expect(notifier.unmatchedSender).not.toHaveBeenCalled();
  });

  it.each(['RESOLVED', 'WAITING'])(
    'opens a %s ticket again, as an answer in the product does',
    async (status) => {
      Object.assign(ticket() as object, {
        status,
        waitingRemindedAt: new Date(),
      });

      await arrive();

      expect(ticket()).toMatchObject({
        status: 'OPEN',
        waitingRemindedAt: null,
      });
      expect(db.events.at(-1)).toMatchObject({
        kind: 'STATE',
        toValue: 'OPEN',
        actorKind: 'REQUESTER',
      });
    },
  );

  it('leaves a ticket that is with another team with that team', async () => {
    Object.assign(ticket() as object, { status: 'ESCALATED' });

    const kept = await arrive();

    expect(kept.outcome).toBe('MATCHED');
    expect(ticket()?.status).toBe('ESCALATED');
    expect(messagesOf(ticketId)).toHaveLength(2);
  });

  it('opens a new ticket that continues a closed one, with the answer as its first message by email', async () => {
    Object.assign(ticket() as object, { status: 'CLOSED' });

    const kept = await arrive({ attachmentCount: 1 });

    const continued = db.tickets.find((t) => t.previousTicketId === ticketId);
    expect(kept).toMatchObject({ outcome: 'MATCHED', ticketId });
    expect(continued).toMatchObject({ subject: 'Re: Help', userId: 'ana' });
    expect(messagesOf(continued?.id as string)).toEqual([
      expect.objectContaining({ channel: 'EMAIL', body: 'With BBVA.' }),
      // The note about attachments goes where the message went.
      expect.objectContaining({
        authorKind: 'SYSTEM',
        visibility: 'INTERNAL',
        body: 'inbound.attachments:1',
      }),
    ]);
    expect(messagesOf(ticketId)).toHaveLength(1);
    expect(teamChannel.ticketOpened).toHaveBeenCalledTimes(1);
  });

  it('accepts the answer of a requester the host no longer knows', async () => {
    Object.assign(ticket() as object, { userId: null });

    const kept = await arrive();

    expect(kept.outcome).toBe('MATCHED');
    expect(messagesOf(ticketId).at(-1)).toMatchObject({
      authorKind: 'REQUESTER',
      authorRef: null,
    });
  });

  it('says in a note for agents how many attachments were left out', async () => {
    await arrive({ attachmentCount: 3 });

    expect(messagesOf(ticketId).slice(-2)).toEqual([
      expect.objectContaining({ channel: 'EMAIL', visibility: 'PUBLIC' }),
      expect.objectContaining({
        authorKind: 'SYSTEM',
        visibility: 'INTERNAL',
        body: 'inbound.attachments:3',
      }),
    ]);
  });

  it('keeps only what the sender wrote, and at most what a message can hold', async () => {
    await arrive({
      text: 'With BBVA.\n\nOn Fri, 9 Oct 2026 at 10:00, CircleSfera <noreply@circlesfera.com> wrote:\n> Which bank?',
    });
    await arrive({ text: 'x'.repeat(6000) });

    const [short, long] = messagesOf(ticketId).slice(-2);
    expect(short.body).toBe('With BBVA.');
    expect((long.body as string).length).toBe(5000);
  });

  describe('creates nothing', () => {
    const untouched = () => {
      expect(messagesOf(ticketId)).toHaveLength(1);
      expect(db.tickets).toHaveLength(1);
      expect(teamChannel.requesterReplied).not.toHaveBeenCalled();
    };

    it('for an email from another address, and tells that sender once', async () => {
      const kept = await arrive({ from: 'mallory@example.com' });

      expect(kept).toMatchObject({ outcome: 'SENDER_MISMATCH', ticketId });
      untouched();
      expect(notifier.unmatchedSender).toHaveBeenCalledWith(
        'mallory@example.com',
      );
    });

    it.each([
      [
        'a forged signature',
        () => address.replace(/\.[0-9a-f]{16}@/, '.0123456789abcdef@'),
      ],
      [
        'the number of a request that does not exist',
        () => address.replace('ticket+1.', 'ticket+999.'),
      ],
      ['another mailbox of the reply domain', () => 'hello@reply.example.com'],
      ['an address somewhere else', () => 'support@example.com'],
    ])('for an email to %s', async (_case, to) => {
      const kept = await arrive({ to: [to()] });

      expect(kept).toMatchObject({ outcome: 'NO_TICKET', ticketId: null });
      untouched();
      expect(notifier.unmatchedSender).toHaveBeenCalledTimes(1);
    });

    it('for the address of a ticket signed for another ticket', async () => {
      const other = (
        await tickets.createTicket({
          email: 'ana@example.com',
          subject: 'Other',
          message: 'x',
          userId: 'ana',
        })
      ).ticketId;
      // The number of the first ticket with the signature of the second.
      const mixed = address.replace(
        /\.[0-9a-f]{16}@/,
        `.${(addresses.for({ id: other, reference: 2 }) as string).split('.')[1].split('@')[0]}@`,
      );

      const kept = await arrive({ to: [mixed] });

      expect(kept.outcome).toBe('NO_TICKET');
      expect(messagesOf(ticketId)).toHaveLength(1);
      expect(messagesOf(other)).toHaveLength(1);
    });

    it('for mail a machine sent, and sends nothing back, even from the requester', async () => {
      const kept = await arrive({
        headers: { 'Auto-Submitted': 'auto-replied' },
      });
      const bounce = await arrive({
        from: 'mailer-daemon@example.com',
        to: ['x@reply.example.com'],
      });

      expect(kept.outcome).toBe('AUTOMATED');
      expect(bounce.outcome).toBe('AUTOMATED');
      untouched();
      expect(notifier.unmatchedSender).not.toHaveBeenCalled();
    });

    it('for spam, and sends nothing back', async () => {
      expect((await arrive({ spamScore: 6 })).outcome).toBe('SPAM');
      expect(
        (await arrive({ spamScore: 12, from: 'x@example.com' })).outcome,
      ).toBe('SPAM');
      // Just under the line, and with no score at all, it is read.
      expect((await arrive({ spamScore: 5.9 })).outcome).toBe('MATCHED');
      expect((await arrive({ spamScore: null })).outcome).toBe('MATCHED');
      expect(notifier.unmatchedSender).not.toHaveBeenCalled();
    });

    it('for an email with nothing of the sender in it', async () => {
      const kept = await arrive({ text: '> Which bank?\n> thanks' });
      const blank = await arrive({ text: '   ' });

      expect(kept).toMatchObject({ outcome: 'EMPTY', ticketId });
      expect(blank.outcome).toBe('EMPTY');
      untouched();
      expect(notifier.unmatchedSender).not.toHaveBeenCalled();
    });

    it('in another organization: the same address and sender reach no ticket there', async () => {
      organization = 'org-b';

      const kept = await arrive();

      expect(kept).toMatchObject({
        outcome: 'NO_TICKET',
        organizationId: 'org-b',
      });
      untouched();
    });
  });

  describe('the note to senders that match nothing', () => {
    it('is sent once a day to each address, whatever they send', async () => {
      await arrive({ from: 'mallory@example.com' });
      await arrive({
        from: 'mallory@example.com',
        to: ['x@reply.example.com'],
      });
      await arrive({ from: 'eve@example.com' });

      expect(notifier.unmatchedSender.mock.calls).toEqual([
        ['mallory@example.com'],
        ['eve@example.com'],
      ]);

      // A day later the first one is told again.
      for (const kept of db.inboundEmails) {
        if (kept.noticeSentAt) {
          kept.noticeSentAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
        }
      }
      await arrive({ from: 'mallory@example.com' });
      expect(notifier.unmatchedSender).toHaveBeenCalledTimes(3);
    });

    it('failing to send it changes nothing else', async () => {
      notifier.unmatchedSender.mockRejectedValueOnce(new Error('mail down'));
      notifier.unmatchedSender.mockRejectedValueOnce('mail down');

      expect((await arrive({ from: 'mallory@example.com' })).outcome).toBe(
        'SENDER_MISMATCH',
      );
      expect((await arrive({ from: 'eve@example.com' })).outcome).toBe(
        'SENDER_MISMATCH',
      );
    });
  });

  describe('running again', () => {
    it('acts on an email once, however many times it is processed', async () => {
      const kept = await arrive();

      await inbound.process(kept.id as string);
      await inbound.process(kept.id as string);
      await inbound.process('missing');

      expect(messagesOf(ticketId)).toHaveLength(2);
    });

    it('writes one message when two runs look at the same email at once', async () => {
      const kept = await arrive();
      Object.assign(kept, { outcome: 'RECEIVED', ticketId: null });

      await Promise.all([
        inbound.process(kept.id as string),
        inbound.process(kept.id as string),
      ]);

      // The one from when it arrived, and one more.
      expect(messagesOf(ticketId)).toHaveLength(3);
    });

    it('leaves the email to be looked at again when its message cannot be written', async () => {
      vi.spyOn(tickets, 'replyByEmail').mockRejectedValueOnce(
        new Error('db down'),
      );

      const kept = await arrive();

      // Kept, and not lost: the route still answered.
      expect(kept).toMatchObject({ outcome: 'RECEIVED', ticketId: null });
      expect(messagesOf(ticketId)).toHaveLength(1);

      expect(await inbound.processPending()).toBe(1);
      expect(kept.outcome).toBe('MATCHED');
      expect(messagesOf(ticketId)).toHaveLength(2);
      expect(await inbound.processPending()).toBe(0);
    });

    it('goes on with the next email when one cannot be processed', async () => {
      const first = await arrive();
      const second = await arrive({ text: 'Second' });
      for (const kept of [first, second]) {
        Object.assign(kept, { outcome: 'RECEIVED', ticketId: null });
      }
      vi.spyOn(tickets, 'replyByEmail')
        .mockRejectedValueOnce(new Error('db down'))
        .mockRejectedValueOnce('db down');

      expect(await inbound.processPending()).toBe(0);
      expect(await inbound.processPending()).toBe(2);
    });

    it('does nothing with an answer whose ticket went away in between', async () => {
      vi.spyOn(tickets, 'replyByEmail').mockResolvedValueOnce(null);

      const kept = await arrive({ attachmentCount: 2 });

      expect(kept.outcome).toBe('MATCHED');
      expect(messagesOf(ticketId)).toHaveLength(1);
    });
  });
});

describe('the text of an email without what it answers', () => {
  it.each([
    [
      'Gmail in English',
      'Thanks, it works now.\n\nOn Fri, Oct 9, 2026 at 10:02 AM CircleSfera <noreply@circlesfera.com> wrote:\n\n> Is it fixed?\n> Regards',
      'Thanks, it works now.',
    ],
    [
      'Gmail in Spanish',
      'Con el BBVA.\n\nEl vie, 9 oct 2026 a las 10:02, CircleSfera (<noreply@circlesfera.com>) escribió:\n\n> ¿Con qué banco?',
      'Con el BBVA.',
    ],
    [
      'Gmail with the "wrote" line broken in two',
      'Yes.\n\nOn Fri, Oct 9, 2026 at 10:02 AM CircleSfera Support Team <\nnoreply@circlesfera.com> wrote:\n> Is it fixed?',
      'Yes.',
    ],
    [
      'Apple Mail in Spanish',
      'Ya funciona.\n\n> El 9 oct 2026, a las 10:02, CircleSfera <noreply@circlesfera.com> escribió:\n> \n> ¿Está arreglado?',
      'Ya funciona.',
    ],
    [
      'Outlook in English',
      'It works.\n\n-----Original Message-----\nFrom: CircleSfera <noreply@circlesfera.com>\nSent: Friday, October 9, 2026 10:02 AM\nSubject: Re: Help\n\nIs it fixed?',
      'It works.',
    ],
    [
      'Outlook in Spanish, with its header block',
      'Funciona.\r\n\r\nDe: CircleSfera <noreply@circlesfera.com>\r\nEnviado el: viernes, 9 de octubre de 2026 10:02\r\nPara: Ana\r\nAsunto: Re: Ayuda\r\n\r\n¿Está arreglado?',
      'Funciona.',
    ],
    [
      'Outlook on the web, with its rule',
      'Done.\n\n________________________________\nFrom: CircleSfera <noreply@circlesfera.com>\nSent: Friday\n\nIs it fixed?',
      'Done.',
    ],
    ['a signature', 'All good.\n\n-- \nAna López\nCEO', 'All good.'],
    ['a signature whose space was lost', 'All good.\n--\nAna', 'All good.'],
  ])('cuts an answer from %s', (_case, text, expected) => {
    expect(cutQuotedText(text)).toBe(expected);
  });

  it('keeps a text with nothing to cut, with its own lines', () => {
    expect(cutQuotedText('  First line.\n\nSecond line.  \n')).toBe(
      'First line.\n\nSecond line.',
    );
  });

  it('does not take ordinary sentences for the start of a quoted email', () => {
    const text =
      'On Monday I wrote to my bank.\nFrom: now on I will use another card.\nEl banco escribió a mi nombre.\n-- and that is all';
    expect(cutQuotedText(text)).toBe(text);
  });

  it('gives nothing for an email that only quotes', () => {
    expect(cutQuotedText('> all quoted\n> lines')).toBe('');
    expect(cutQuotedText('')).toBe('');
  });
});
