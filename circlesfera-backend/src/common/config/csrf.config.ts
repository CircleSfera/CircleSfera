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
