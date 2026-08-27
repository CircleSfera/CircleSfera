import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { profiles: { some: { avatar: { contains: 'ea0102e5' } } } },
    include: { profiles: true },
  });
  console.log(
    'Users with missing avatar:',
    users.map((u) => u.profiles[0]?.username),
  );
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
