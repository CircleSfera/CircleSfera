import type { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'api/v1';

/** What every start of the server sets on the app, tests included. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX);
  // Express names itself in every answer; nothing needs to know.
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  // Express names itself in every answer; nothing needs to know.
  app.enableShutdownHooks();
  return app;
}
