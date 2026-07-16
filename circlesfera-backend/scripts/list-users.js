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
      `ID: ${u.id} | Email: ${u.email} | User: ${u.profile?.username} | FullName: ${u.profile?.fullName} | Role: ${u.role}`,
    );
  });
  const posts = await prisma.post.findMany({
    include: { user: { include: { profile: true } } },
  });
  console.log('--- POSTS ---');
  posts.forEach((p) => {
    console.log(
      `Post ID: ${p.id} | Author: ${p.user.profile?.username} | Caption: ${p.caption}`,
    );
  });
  const follows = await prisma.follow.findMany();
  console.log('--- FOLLOWS ---');
  console.log(follows);
  const suggestions = await prisma.user.findMany({
    where: {
      id: { not: 'fd9babd0-9a0b-47d8-95a0-a131e19d852b' },
      isActive: true,
      profile: { isNot: null },
      followers: {
        none: { followerId: 'fd9babd0-9a0b-47d8-95a0-a131e19d852b' },
      },
      blocking: {
        none: { blockedId: 'fd9babd0-9a0b-47d8-95a0-a131e19d852b' },
      },
      blockedBy: {
        none: { blockerId: 'fd9babd0-9a0b-47d8-95a0-a131e19d852b' },
      },
    },
    include: {
      profile: true,
    },
  });
  console.log('--- SUGGESTIONS QUERY RESULTS ---');
  console.log(suggestions);
  const blocks = await prisma.block.findMany();
  console.log('--- BLOCKS ---');
  console.log(blocks);
  await prisma.$disconnect();
}
main()
  .catch(console.error)
  .finally(() => process.exit());
//# sourceMappingURL=list-users.js.map
