import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;
async function listUsers() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    const users = await prisma.user.findMany({
      include: { profile: true },
    });
    console.log(
      'Users in DB:',
      JSON.stringify(
        users.map((u) => ({
          email: u.email,
          username: u.profile?.username,
          isActive: u.isActive,
        })),
        null,
        2,
      ),
    );
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}
void listUsers();
//# sourceMappingURL=check-user.js.map
