import type { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'api/v1';

/** What every start of the server sets on the app, tests included. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  return app;
}
