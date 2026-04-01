# Infrastructure: Environment Configuration (Absolute Detail)

This document provides a comprehensive map of all configuration variables required for a production-ready CircleSfera deployment.

## 1. Backend Core & Persistence

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `3000` | Internal server port for the NestJS application. |
| `NODE_ENV` | Yes | `development`| Set to `production` for strict security checks. |
| `DATABASE_URL` | Yes | | PostgreSQL URI (e.g., `postgresql://...`). |
| `REDIS_HOST` | No | `localhost` | Host for Redis cache and Pub/Sub. |
| `REDIS_PORT` | No | `6379` | Port for Redis connection. |

## 2. Security & Authentication (Critical)

| Variable | Required | Description | Minimum Length |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | Yes | Main secret for signing access tokens. | 64 chars |
| `JWT_REFRESH_SECRET`| Yes | Secret for signing long-term refresh tokens. | 64 chars |
| `CSRF_SECRET` | Yes | Secret used to generate double-csrf tokens. | 64 chars |
| `CORS_ORIGIN` | Yes | Comma-separated list of allowed URLs (Frontend).| |

### Security Policy Impact
- If `NODE_ENV=production`, `SECURE_COOKIE` is automatically enforced on all auth cookies.
- The `ValidationPipe` will forbid any non-whitelisted fields in API payloads.

## 3. External Integrations

### Stripe (Monetization)
| Variable | Description |
| :--- | :--- |
| `STRIPE_SECRET_KEY` | Private API key for processing orders and Connect onboarding. |
| `STRIPE_WEBHOOK_SECRET`| Secret used to verify that webhook calls originate from Stripe. |
| `STRIPE_PLATFORM_FEE` | Percentage fee (e.g., `0.20` for 20%) taken from creator sales. |

### Cloudinary (CDN)
- `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- **Note**: If any are missing, the system falls back to the local `/uploads` folder.

### Communication (SMTP)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
- `FROM_EMAIL`: Address used as the "From" header in transactional emails.

## 4. Frontend Configuration (Vite)

- `VITE_API_URL`: The public-facing URL of the Backend API (prefixed with `/api/v1`).
- `VITE_WSS_URL`: The public-facing URL for WebSocket connections.
- `VITE_STRIPE_PUBLIC_KEY`: Public key for initializing Stripe.js Elements.

## 5. Security Recommendations
- **Secrets Management**: Never commit actual values to Git. Use `.env.production` on the host or a secure vault.
- **Log Levels**: In production, ensure `DEBUG` logs are disabled to prevent sensitive data leakage.
