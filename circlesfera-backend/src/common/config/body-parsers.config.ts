import type { IncomingMessage } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import bodyParser from 'body-parser';

// Keeps the bytes of a request as they arrived, on `req.rawBody`. A signature
// (Stripe's events, Slack's commands) is checked against those bytes, never
// against the parsed body.
function keepRawBody(req: IncomingMessage, _res: unknown, buf: Buffer): void {
  (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
}

// The parsers registered here run before Nest's own, so Nest's `rawBody`
// option never sees a body: each of them keeps the raw bytes itself.
export function useBodyParsers(app: INestApplication): void {
  // Stripe events: the raw body, bounded to 1MB.
  app.use(
    '/api/v1/payments/webhook',
    bodyParser.raw({
      type: 'application/json',
      limit: '1mb',
      verify: keepRawBody,
    }),
  );

  // CSP violation reports use their own content types; bounded to 16KB.
  app.use(
    '/api/v1/security/csp-report',
    bodyParser.json({
      type: ['application/csp-report', 'application/reports+json'],
      limit: '16kb',
    }),
  );

  // Use sensible global body parser limits (DoS protection)
  // Bounded to 2MB for JSON and URL-encoded payloads; file uploads go through multipart
  app.use(bodyParser.json({ limit: '2mb', verify: keepRawBody }));
  app.use(
    bodyParser.urlencoded({
      limit: '2mb',
      extended: true,
      parameterLimit: 1000,
      verify: keepRawBody,
    }),
  );
}
