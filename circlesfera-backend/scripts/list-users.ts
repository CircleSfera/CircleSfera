import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const users = await prisma.user.findMany({
    include: { profile: true },
  });
  console.log('--- USERS ---');
  users.forEach((u) => {
    console.log(
      `ID: ${u.id} | Email: ${u.email} | User: ${u.profile?.username} | Role: ${u.role}`,
    );
  });

  await prisma.$disconnect();
}

main()
  .catch(console.error)
  .finally(() => process.exit());
