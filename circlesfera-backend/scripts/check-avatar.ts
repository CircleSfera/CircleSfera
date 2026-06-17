import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { avatarUrl: { contains: 'ea0102e5' } },
  });
  console.log(
    'Users with missing avatar:',
    users.map((u) => u.username),
  );
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
