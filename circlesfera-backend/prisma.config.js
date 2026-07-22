import * as dotenv from 'dotenv';

dotenv.config();
export default {
  datasource: {
    url: process.env.DATABASE_URL,
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
};
//# sourceMappingURL=prisma.config.js.map
