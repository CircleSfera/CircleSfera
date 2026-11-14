import { describe, expect, it, vi } from 'vitest';
import { askVies, hasDnsProof, hasMetaProof } from './company-checks.js';

const page = (html: string) =>
  vi.fn().mockResolvedValue({
    buffer: Buffer.from(html),
    contentType: 'text/html',
    ext: 'html',
  });

describe('domain proof', () => {
  it('finds the TXT record with the code, joined from its parts', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue([
        ['v=spf1 -all'],
        ['circlesfera-ver', 'ification=abc'],
      ]);
    await expect(hasDnsProof('example.com', 'abc', resolve)).resolves.toBe(
      true,
    );
    expect(resolve).toHaveBeenCalledWith('example.com');
    await expect(hasDnsProof('example.com', 'other', resolve)).resolves.toBe(
      false,
    );
  });

  it('a domain that cannot be resolved has no record', async () => {
    const resolve = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    await expect(hasDnsProof('example.com', 'abc', resolve)).resolves.toBe(
      false,
    );
  });

  it('finds the meta tag in either order of its attributes, over HTTPS only and bounded', async () => {
    const fetchPage = page(
      '<html><head><meta charset="utf-8"><meta content="abc" name="circlesfera-verification"></head></html>',
    );
    await expect(
      hasMetaProof('example.com', 'abc', fetchPage as never),
    ).resolves.toBe(true);
    expect(fetchPage).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({
        requireHttps: true,
        allowedPorts: [443],
        maxBytes: 512 * 1024,
        allowedMimeTypes: [],
      }),
    );
    await expect(
      hasMetaProof(
        'example.com',
        'abc',
        page("<meta name='circlesfera-verification' content='xyz'>") as never,
      ),
    ).resolves.toBe(false);
  });

  it('follows no redirect, and tries www. on the domain when the domain itself has no tag', async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Too many redirects'))
      .mockResolvedValueOnce({
        buffer: Buffer.from(
          '<head><meta name="circlesfera-verification" content="abc"></head>',
        ),
      });
    await expect(
      hasMetaProof('example.com', 'abc', fetchPage as never),
    ).resolves.toBe(true);
    expect(fetchPage.mock.calls.map((call) => call[0])).toEqual([
      'https://example.com/',
      'https://www.example.com/',
    ]);
    for (const call of fetchPage.mock.calls) {
      expect(call[1]).toMatchObject({ maxRedirects: 0 });
    }
  });

  it('counts a tag only in the head, not in a comment, a script or the body', async () => {
    for (const html of [
      '<head><!-- <meta name="circlesfera-verification" content="abc"> --></head>',
      '<head><script>var t = \'<meta name="circlesfera-verification" content="abc">\'</script></head>',
      '<head></head><body><meta name="circlesfera-verification" content="abc"></body>',
    ]) {
      await expect(
        hasMetaProof('example.com', 'abc', page(html) as never),
      ).resolves.toBe(false);
    }
  });

  it('a comment left open hides what follows, and a tag after a closed script counts', async () => {
    await expect(
      hasMetaProof(
        'example.com',
        'abc',
        page(
          '<head><!-- open <meta name="circlesfera-verification" content="abc"></head>',
        ) as never,
      ),
    ).resolves.toBe(false);
    await expect(
      hasMetaProof(
        'example.com',
        'abc',
        page(
          '<head><script>x()</script ><!-- c --><meta name="circlesfera-verification" content="abc"></head>',
        ) as never,
      ),
    ).resolves.toBe(true);
    // A page with no head end: the whole page is its head.
    await expect(
      hasMetaProof(
        'example.com',
        'abc',
        page('<meta name="circlesfera-verification" content="abc">') as never,
      ),
    ).resolves.toBe(true);
  });

  it('a page that cannot be read, or is refused, has no tag', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('blocked'));
    await expect(
      hasMetaProof('example.com', 'abc', fetchPage as never),
    ).resolves.toBe(false);
  });
});

describe('VIES', () => {
  const answer = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue({
      ok: status < 400,
      json: async () => body,
    });

  it('says whether the number is registered, with the name it gives', async () => {
    const fetchImpl = answer(200, { isValid: true, name: ' ACME SL ' });
    await expect(askVies('B12345674', fetchImpl as never)).resolves.toEqual({
      valid: true,
      name: 'ACME SL',
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/ES/vat/B12345674',
    );
  });

  it('keeps no name VIES hides, and tells an unknown number', async () => {
    await expect(
      askVies(
        '12345678Z',
        answer(200, {
          isValid: false,
          name: '---',
          userError: 'INVALID',
        }) as never,
      ),
    ).resolves.toEqual({ valid: false, name: null });
  });

  it('gives no answer when VIES or the national service is down, or replies oddly', async () => {
    await expect(
      askVies(
        'B12345674',
        answer(200, { isValid: false, userError: 'MS_UNAVAILABLE' }) as never,
      ),
    ).resolves.toBeNull();
    await expect(
      askVies('B12345674', answer(503, {}) as never),
    ).resolves.toBeNull();
    await expect(
      askVies('B12345674', answer(200, { something: 1 }) as never),
    ).resolves.toBeNull();
    await expect(
      askVies(
        'B12345674',
        vi.fn().mockRejectedValue(new Error('timeout')) as never,
      ),
    ).resolves.toBeNull();
  });
});
