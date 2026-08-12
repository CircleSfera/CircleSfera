import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE'] } },
  });
  console.log(
    'Admins in DB:',
    users.map((u) => ({ id: u.id, email: u.email, role: u.role })),
  );
}
main().finally(() => prisma.$disconnect());
