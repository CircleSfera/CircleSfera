import type { CookieOptions } from 'express';

/**
 * Centralized cookie configuration for JWT tokens.
 * Both cookies use httpOnly + sameSite + secure flags for XSS/CSRF protection.
 */

/** Base cookie options shared by both tokens. */
const isProd = process.env.NODE_ENV === 'production';
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd, // Required for SameSite=None in prod
  sameSite: isProd
    ? process.env.ALLOW_CROSS_DOMAIN_COOKIES === 'true'
      ? 'none'
      : 'lax'
    : 'lax',
  path: '/',
};

/** Access token cookie (short-lived, 15 minutes). */
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const accessTokenCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

/** Refresh token cookie (long-lived, 7 days). */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const refreshTokenCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/** Options to clear cookies (used on logout). */
export const clearCookieOptions: CookieOptions = {
  ...baseCookieOptions,
};
