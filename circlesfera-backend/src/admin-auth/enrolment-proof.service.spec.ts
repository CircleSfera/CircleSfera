import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENROLMENT_PROOF_TTL_MS,
  EnrolmentProofService,
} from './enrolment-proof.service.js';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// The proof beyond the password that lets a staff identity enrol its
// authenticator: kept only as a hash, once, for 24 hours.
describe('EnrolmentProofService', () => {
  let prisma: {
    adminIdentity: {
      update: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let email: { sendStaffEnrolmentEmail: ReturnType<typeof vi.fn> };
  let env: Record<string, string | undefined>;
  let service: EnrolmentProofService;

  beforeEach(() => {
    prisma = {
      adminIdentity: {
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    email = { sendStaffEnrolmentEmail: vi.fn().mockResolvedValue(undefined) };
    env = {};
    service = new EnrolmentProofService(
      prisma as never,
      email as never,
      { get: (k: string) => env[k] } as never,
    );
  });

  const kept = () => prisma.adminIdentity.update.mock.calls.at(-1)?.[0].data;

  it('sends a link to the staff email and keeps only the hash of its token, for 24 hours', async () => {
    env.ADMIN_BASE_URL = 'https://admin.example.test/';
    const before = Date.now();

    await service.sendLink({ id: 'op-1', email: 'p@example.com' });

    const [to, url] = email.sendStaffEnrolmentEmail.mock.calls[0];
    expect(to).toBe('p@example.com');
    const token = new URL(url).searchParams.get('enrol') as string;
    expect(url.startsWith('https://admin.example.test/login?enrol=')).toBe(
      true,
    );
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(kept().enrolmentProofHash).toBe(sha256(token));
    expect(JSON.stringify(kept())).not.toContain(token);
    const expires = kept().enrolmentProofExpiresAt.getTime();
    expect(expires).toBeGreaterThanOrEqual(before + ENROLMENT_PROOF_TTL_MS);
  });

  it('links to the Admin Panel when no address is set', async () => {
    await service.sendLink({ id: 'op-1', email: 'p@example.com' });

    expect(email.sendStaffEnrolmentEmail.mock.calls[0][1]).toMatch(
      /^https:\/\/admin\.circlesfera\.com\/login\?enrol=/,
    );
  });

  it('issues a code easy to read aloud, and keeps only its hash', async () => {
    const code = await service.issueCode('op-1');

    expect(code).toMatch(
      /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/,
    );
    expect(kept().enrolmentProofHash).toBe(sha256(code.replace(/-/g, '')));
  });

  describe('using a proof', () => {
    const keepProof = (
      raw: string,
      expiresAt = new Date(Date.now() + 60_000),
    ) =>
      prisma.adminIdentity.findUnique.mockResolvedValue({
        enrolmentProofHash: sha256(raw),
        enrolmentProofExpiresAt: expiresAt,
      });

    it('takes a link token as it came', async () => {
      keepProof('Tok_en-AbC');

      await expect(service.consume('op-1', 'Tok_en-AbC')).resolves.toBe(true);
      expect(prisma.adminIdentity.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'op-1',
          enrolmentProofHash: sha256('Tok_en-AbC'),
          enrolmentProofExpiresAt: { gt: expect.any(Date) },
        },
        data: { enrolmentProofHash: null, enrolmentProofExpiresAt: null },
      });
    });

    it('takes a code in any case, with spaces or dashes', async () => {
      keepProof('ABCDEFGHJKMN');

      await expect(service.consume('op-1', ' abcd efgh-jkmn ')).resolves.toBe(
        true,
      );
    });

    it('is spent once: a second use at the same moment loses', async () => {
      keepProof('ABCDEFGHJKMN');
      prisma.adminIdentity.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.consume('op-1', 'ABCDEFGHJKMN')).resolves.toBe(
        false,
      );
    });

    it.each([
      ['a wrong proof', () => keepProof('ABCDEFGHJKMN'), 'ZZZZZZZZZZZZ'],
      [
        'an expired proof',
        () => keepProof('ABCDEFGHJKMN', new Date(Date.now() - 1)),
        'ABCDEFGHJKMN',
      ],
      [
        'no proof kept',
        () =>
          prisma.adminIdentity.findUnique.mockResolvedValue({
            enrolmentProofHash: null,
            enrolmentProofExpiresAt: null,
          }),
        'ABCDEFGHJKMN',
      ],
      [
        'an unknown identity',
        () => prisma.adminIdentity.findUnique.mockResolvedValue(null),
        'ABCDEFGHJKMN',
      ],
      ['an empty proof', () => keepProof('ABCDEFGHJKMN'), '   '],
      [
        'a proof far too long',
        () => keepProof('ABCDEFGHJKMN'),
        'A'.repeat(201),
      ],
    ])('refuses %s and spends nothing', async (_name, arrange, given) => {
      arrange();

      await expect(service.consume('op-1', given)).resolves.toBe(false);
      expect(prisma.adminIdentity.updateMany).not.toHaveBeenCalled();
    });
  });
});
