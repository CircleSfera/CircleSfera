import type { CDPSession, Page } from '@playwright/test';

/**
 * A virtual passkey authenticator in Chromium (DevTools WebAuthn domain): a
 * platform authenticator that keeps resident keys and verifies the user, as
 * Touch ID or Windows Hello would. The ceremonies of the app run against it
 * unchanged.
 */
export async function addVirtualAuthenticator(
  page: Page,
): Promise<{ cdp: CDPSession; authenticatorId: string }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send(
    'WebAuthn.addVirtualAuthenticator',
    {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  return { cdp, authenticatorId };
}

/** The credentials the virtual authenticator holds now. */
export async function storedCredentials(
  cdp: CDPSession,
  authenticatorId: string,
): Promise<number> {
  const { credentials } = await cdp.send('WebAuthn.getCredentials', {
    authenticatorId,
  });
  return credentials.length;
}
