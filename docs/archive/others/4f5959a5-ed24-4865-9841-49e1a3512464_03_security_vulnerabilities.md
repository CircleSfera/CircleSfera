# 3. Security & Vulnerabilities Audit

## Executive Summary

The security posture of CircleSfera has significantly improved since the previous audit. The migration to **HTTP-only cookies** and the implementation of **Double-Submit Cookie CSRF protection** address the most critical risks.

## 🛡️ Security Analysis

| Category           | Status    | Findings                                                            |
| ------------------ | --------- | ------------------------------------------------------------------- |
| **Authentication** | ✅ Secure | HTTP-only cookies used. No tokens in `localStorage`.                |
| **Injection**      | ✅ Secure | No `queryRaw` usage found. Prisma handles usage.                    |
| **CSRF**           | ✅ Secure | `doubleCsrfProtection` middleware active in `main.ts`.              |
| **Headers**        | ✅ Secure | `helmet()` active.                                                  |
| **CORS**           | ✅ Secure | Strict origin check enabled for production.                         |
| **Secrets**        | ⚠️ Risk   | `.env` file management needs verification (ensure it's not in git). |

### 🔍 Key Findings

1.  **Auth Token Storage**: The `JwtStrategy` correctly extracts tokens from `req.cookies`, protecting against XSS attacks that target `localStorage`.
2.  **Rate Limiting**: `ThrottlerGuard` is globally active (`AppModule`), mitigating brute-force attacks.
3.  **Input Validation**: `ValidationPipe` with `whitelist: true` prevents mass-assignment vulnerabilities.

### ⚠️ Remaining Risks

1.  **Content Security Policy (CSP)**: `helmet()` provides a default CSP, but for a social media app with user uploads and potentially embedded content (Frames), a stricter, custom CSP is recommended.
2.  **ReDoS Potential**: Regex used for extracting hashtags (`/#[\w-]+/g`) in `PostsService` is simple, but should be tested against large payloads to ensure it doesn't block the event loop.

## 📋 Action Plan

- [ ] **High**: Rotate all JWT secrets in production now that the auth flow is stable.
- [ ] **Medium**: Implement a custom CSP in `helmet` config to strictly define allowed media sources (e.g., only your S3 bucket).
- [ ] **Low**: Add a "max length" validation to Post captions before running regex extraction.
