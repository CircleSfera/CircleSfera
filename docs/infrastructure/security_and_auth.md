# Infrastructure: Security & Authentication

CircleSfera implements a multi-layered security architecture to protect user data and maintain platform integrity.

## 1. Authentication Flow

### JWT with HTTP-only Cookies
The platform uses JSON Web Tokens (JWT) for session management, stored in secure, `HttpOnly` cookies to prevent XSS attacks.
- **Access Token**: Short-lived, used for API authorization.
- **Refresh Token**: Long-lived, used to rotate access tokens without forcing re-login.
- **Cookie Security**: Flags include `Secure` (production), `SameSite=Strict`, and `HttpOnly`.

### WebAuthn / Passkeys
Advanced biometric authentication is supported via the WebAuthn standard, allowing users to log in with secure device credentials (Touch ID, Face ID, etc.).

### Password Management
- Hashed using **Argon2** (industry standard for password hashing).
- Verification via email with one-time tokens for registration and resets.

## 2. API Security

### CSRF Protection
Enabled globally via the **Double CSRF** pattern.
- A CSRF token is provided via the `/api/v1/csrf-token` endpoint.
- All state-changing requests (POST, PUT, DELETE, PATCH) must include the `x-csrf-token` header.

### CORS (Cross-Origin Resource Sharing)
Strictly restricted to allowed origins in production.
- Managed via the `CORS_ORIGIN` environment variable.
- Includes `credentials: true` to support cookie-based auth.

### Security Headers (Helmet)
Globallly applied via `helmet` with a strict **Content Security Policy (CSP)**:
- Blocks unauthorized external scripts and fonts.
- Restricts image and media sources to authorized CDNs (e.g., Cloudinary).

## 3. Authorization (RBAC)

Access control is managed via NestJS Guards:
- **`JwtAuthGuard`**: Ensures a valid access token is present.
- **`JwtOptionalGuard`**: Extracts user data if present but allows guest access.
- **`AdminGuard`**: Restricts access to users with the `ADMIN` role.

## 4. Rate Limiting & DoS Protection
- Global body-parser limits (500MB max payload for media).
- Validation via `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` to prevent mass-assignment vulnerabilities.
