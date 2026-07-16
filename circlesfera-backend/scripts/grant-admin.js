import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;
async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const identifier = process.argv[2] || 'admin@circlesfera.com';
  try {
    let user;
    if (identifier.includes('@')) {
      user = await prisma.user.findUnique({
        where: { email: identifier },
      });
    } else {
      user = await prisma.user.findFirst({
        where: { profile: { username: identifier } },
      });
    }
    if (!user) {
      console.error(`User ${identifier} not found`);
      return;
    }
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { role: Role.ADMIN },
    });
    console.log(`Successfully granted ADMIN role to ${updatedUser.email}`);
  } catch (err) {
    console.error('Error granting admin:', err);
  } finally {
    await prisma.$disconnect();
  }
}
void main();
//# sourceMappingURL=grant-admin.js.map
