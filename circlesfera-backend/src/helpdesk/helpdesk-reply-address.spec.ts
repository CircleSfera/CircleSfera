import { describe, expect, it } from 'vitest';
import { HelpdeskReplyAddress } from './helpdesk-reply-address.js';

describe('HelpdeskReplyAddress', () => {
  const build = (
    settings: Record<string, string | undefined>,
    organization = 'org-1',
  ) =>
    new HelpdeskReplyAddress({ get: (key: string) => settings[key] } as never, {
      current: () => organization,
    });
  const on = {
    HELPDESK_REPLY_DOMAIN: ' Reply.Example.com ',
    HELPDESK_REPLY_SECRET: 'a-secret-only-the-server-has',
  };
  const ticket = { id: 't-1', reference: 1042 };

  it('gives each ticket its own address at the reply domain', () => {
    const addresses = build(on);
    const address = addresses.for(ticket) as string;

    expect(address).toMatch(/^ticket\+1042\.[0-9a-f]{16}@reply\.example\.com$/);
    expect(addresses.for(ticket)).toBe(address);
    expect(addresses.for({ id: 't-2', reference: 1043 })).not.toBe(address);
  });

  it('reads the number and the signature back from an address, whatever its capitals', () => {
    const addresses = build(on);
    const address = (addresses.for(ticket) as string).toUpperCase();

    const read = addresses.referenceIn(`  ${address} `);

    expect(read?.reference).toBe(1042);
    expect(addresses.signed('t-1', read?.signature ?? '')).toBe(true);
  });

  it('does not accept the signature of another ticket, of another organization or of another secret', () => {
    const addresses = build(on);
    const signature = addresses.referenceIn(addresses.for(ticket) as string)
      ?.signature as string;

    // The number alone, with the signature of a different ticket.
    expect(addresses.signed('t-2', signature)).toBe(false);
    expect(build(on, 'org-2').signed('t-1', signature)).toBe(false);
    expect(
      build({ ...on, HELPDESK_REPLY_SECRET: 'another' }).signed(
        't-1',
        signature,
      ),
    ).toBe(false);
    expect(addresses.signed('t-1', '')).toBe(false);
    expect(addresses.signed('t-1', `${signature}0`)).toBe(false);
  });

  it.each([
    ['another domain', 'ticket+1042.0123456789abcdef@example.com'],
    [
      'a domain that only ends alike',
      'ticket+1042.0123456789abcdef@evilreply.example.com.evil.com',
    ],
    ['no signature', 'ticket+1042@reply.example.com'],
    ['a short signature', 'ticket+1042.0123@reply.example.com'],
    [
      'a number that is not one',
      'ticket+abc.0123456789abcdef@reply.example.com',
    ],
    ['another mailbox', 'support@reply.example.com'],
    ['nothing', ''],
  ])('reads nothing from an address with %s', (_case, address) => {
    expect(build(on).referenceIn(address)).toBeNull();
  });

  it.each([
    ['the domain', { HELPDESK_REPLY_SECRET: 'x' }],
    ['the secret', { HELPDESK_REPLY_DOMAIN: 'reply.example.com' }],
    ['both', {}],
    [
      'a blank secret',
      {
        HELPDESK_REPLY_DOMAIN: 'reply.example.com',
        HELPDESK_REPLY_SECRET: '  ',
      },
    ],
  ])(
    'is off without %s: no address, nothing read, nothing signed',
    (_case, settings) => {
      const addresses = build(settings);

      expect(addresses.enabled).toBe(false);
      expect(addresses.for(ticket)).toBeUndefined();
      expect(
        addresses.referenceIn('ticket+1042.0123456789abcdef@reply.example.com'),
      ).toBeNull();
      expect(addresses.signed('t-1', '0123456789abcdef')).toBe(false);
    },
  );
});
