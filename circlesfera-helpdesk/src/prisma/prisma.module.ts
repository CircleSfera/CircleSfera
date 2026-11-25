import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** Reads the Help Desk database address; stops the start without it. */
export function helpdeskDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const url = env.HELPDESK_DATABASE_URL;
  if (!url) {
    throw new Error('HELPDESK_DATABASE_URL is not defined');
  }
  return url;
}

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: () => new PrismaService(helpdeskDatabaseUrl()),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
