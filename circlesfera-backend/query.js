const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE'] } },
  });
  console.log('Admins:', users);
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
