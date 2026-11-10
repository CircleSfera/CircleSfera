import { generateSecret, generateSync } from 'otplib';
import { describe, expect, it, vi } from 'vitest';
import { takeTotpCodeOnce } from './totp-once.js';

// Runs the real otplib: the step kept is the one the code matched.
describe('takeTotpCodeOnce', () => {
  const prisma = (count: number) => ({
    signIn: { updateMany: vi.fn().mockResolvedValue({ count }) },
  });

  it('takes a right code, keeping its step only if later than the last', async () => {
    const secret = generateSecret();
    const db = prisma(1);

    await expect(
      takeTotpCodeOnce(db as never, 'si-1', generateSync({ secret }), secret),
    ).resolves.toBe(true);

    const step = Math.floor(Date.now() / 1000 / 30);
    const { where, data } = db.signIn.updateMany.mock.calls[0][0];
    expect(data.twoFactorLastTimeStep).toBeGreaterThanOrEqual(step - 1);
    expect(data.twoFactorLastTimeStep).toBeLessThanOrEqual(step);
    expect(where).toEqual({
      id: 'si-1',
      OR: [
        { twoFactorLastTimeStep: null },
        { twoFactorLastTimeStep: { lt: data.twoFactorLastTimeStep } },
      ],
    });
  });

  it('refuses a right code whose step was taken already', async () => {
    const secret = generateSecret();
    await expect(
      takeTotpCodeOnce(
        prisma(0) as never,
        'si-1',
        generateSync({ secret }),
        secret,
      ),
    ).resolves.toBe(false);
  });

  it('takes nothing for a wrong code or a malformed secret', async () => {
    const secret = generateSecret();
    const db = prisma(1);
    await expect(
      takeTotpCodeOnce(db as never, 'si-1', '000000', secret),
    ).resolves.toBe(false);
    await expect(
      takeTotpCodeOnce(db as never, 'si-1', '123456', '!!not base32!!'),
    ).resolves.toBe(false);
    expect(db.signIn.updateMany).not.toHaveBeenCalled();
  });
});
