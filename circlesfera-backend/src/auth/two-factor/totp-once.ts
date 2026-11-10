import { verifySync } from 'otplib';
import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Takes a two-step verification code for a sign-in, once: a right code is
 * accepted only if its time step is later than that of the last code the
 * sign-in used, and that step is kept by the same write that checks it, so a
 * code seen over a shoulder, or sent twice at once, works only once. A
 * malformed secret makes otplib throw: that is a wrong code.
 */
export async function takeTotpCodeOnce(
  prisma: Pick<PrismaService, 'signIn'>,
  signInId: string,
  token: string,
  secret: string,
): Promise<boolean> {
  let timeStep: number;
  try {
    const result = verifySync({ token, secret, epochTolerance: 120 });
    // A TOTP result names its time step; anything else is no code here.
    if (
      result?.valid !== true ||
      !('timeStep' in result) ||
      typeof result.timeStep !== 'number'
    ) {
      return false;
    }
    timeStep = result.timeStep;
  } catch {
    return false;
  }
  const taken = await prisma.signIn.updateMany({
    where: {
      id: signInId,
      OR: [
        { twoFactorLastTimeStep: null },
        { twoFactorLastTimeStep: { lt: timeStep } },
      ],
    },
    data: { twoFactorLastTimeStep: timeStep },
  });
  return taken.count === 1;
}
