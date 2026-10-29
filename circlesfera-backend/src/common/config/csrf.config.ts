import { doubleCsrf } from 'csrf-csrf';
import type { Request } from 'express';

export const CSRF_COOKIE_NAME = 'x-csrf-token';

export const {
  generateCsrfToken, // This function generates a token and sets the cookie
  validateRequest, // This function validates the token
  doubleCsrfProtection, // This is the middleware
} = doubleCsrf({
  getSecret: () => {
    const secret = process.env.CSRF_SECRET;
    if (!secret) {
      throw new Error('CSRF_SECRET environment variable is missing');
    }
    return secret;
  },
  cookieName: CSRF_COOKIE_NAME, // The name of the cookie to be used
  cookieOptions: {
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true, // Key: cookie is httpOnly, token returned in body
  },
  size: 64, // The size of the generated token in bits
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'], // A list of request methods that properly validation
  getCsrfTokenFromRequest: (req: Request) => {
    return (req.headers['x-csrf-token'] as string) || '';
  },
  getSessionIdentifier: (req: Request) => {
    // We use the 'sub' (userId) as the stable identifier for CSRF.
    // This avoids invalidating CSRF tokens every 15 minutes when the access_token rotates.
    const accessToken = req.cookies?.access_token as string | undefined;
    const refreshToken = req.cookies?.refresh_token as string | undefined;

    const extractSub = (token?: string): string | null => {
      if (!token) return null;
      try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const decoded = JSON.parse(
          Buffer.from(payload, 'base64').toString('utf8'),
        ) as { sub?: string };
        return decoded.sub || null;
      } catch {
        return null;
      }
    };

    return extractSub(accessToken) || extractSub(refreshToken) || '';
  },
});

// Routes that take no CSRF token, given as the request's path with repeated
// and trailing slashes removed. Each one either sets the session up (sign-in,
// refresh) or is called by a party without the app's cookies, and then checks
// its own proof instead.
export function isCsrfExempt(normalizedPath: string): boolean {
  return (
    normalizedPath.includes('/auth/login') ||
    normalizedPath.includes('/auth/register') ||
    normalizedPath.includes('/auth/refresh') ||
    normalizedPath.includes('/auth/verify-email') ||
    normalizedPath.includes('/auth/request-reset') ||
    normalizedPath.includes('/auth/reset-password') ||
    normalizedPath.includes('/auth/passkey/login-options') ||
    normalizedPath.includes('/auth/passkey/login-verify') ||
    normalizedPath.includes('/admin-auth/login') ||
    normalizedPath.includes('/admin-auth/mfa/verify') ||
    normalizedPath.includes('/admin-auth/refresh') ||
    normalizedPath.includes('/csrf-token') ||
    normalizedPath.includes('/payments/webhook') ||
    // Browsers send CSP violation reports without cookies or a CSRF token.
    // The endpoint only logs a sanitized summary and changes nothing.
    normalizedPath === '/api/v1/security/csp-report' ||
    // The mail provider posts received email without cookies. The route
    // has no session and asks for its own secret token instead.
    normalizedPath === '/api/v1/helpdesk/inbound/email' ||
    // A mail client's one-click unsubscribe posts without cookies. The
    // route has no session and asks for the signed token of its link.
    normalizedPath === '/api/v1/newsletter/unsubscribe' ||
    // Slack posts slash commands and button clicks without cookies. Both
    // routes ask for Slack's signature of the request (SlackGuard), and a
    // click acts only as the member of staff behind that Slack account.
    normalizedPath === '/api/v1/slack/commands' ||
    normalizedPath === '/api/v1/slack/interactions' ||
    normalizedPath.includes('/socket.io')
  );
}
