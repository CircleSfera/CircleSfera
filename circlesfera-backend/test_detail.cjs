const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findFirst();
  console.log('Testing detail for user:', user.id);
  const detail = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        profile: true,
        posts: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, caption: true, createdAt: true, type: true },
        },
        reports: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, reason: true, status: true, createdAt: true },
        },
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
          },
        },
      },
    });
  console.log('Success:', detail.id);
}
main().catch(console.error).finally(() => prisma.$disconnect());
