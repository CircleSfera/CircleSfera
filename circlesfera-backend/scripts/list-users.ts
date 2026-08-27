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
    include: { profiles: true },
  });
  console.log('--- USERS ---');
  users.forEach((u) => {
    console.log(
      `ID: ${u.id} | Email: ${u.email} | User: ${u.profiles[0]?.username} | FullName: ${u.profiles[0]?.fullName} | Role: ${u.role}`,
    );
  });

  const posts = await prisma.post.findMany({
    include: { profile: { include: { user: true } } },
  });
  console.log('--- POSTS ---');
  posts.forEach((p) => {
    console.log(
      `Post ID: ${p.id} | Author: ${p.profile?.username} | Caption: ${p.caption}`,
    );
  });

  const follows = await prisma.follow.findMany();
  console.log('--- FOLLOWS ---');
  console.log(follows);

  // Import and run UsersService getSuggestions
  const suggestions = await prisma.user.findMany({
    where: {
      id: { not: 'fd9babd0-9a0b-47d8-95a0-a131e19d852b' }, // Exclude self (EasyFeliu)
      isActive: true, // Only active users
      profiles: { some: {} }, // Ensure they have a profile
      // Exclude users already followed
      followers: {
        none: { followerId: 'fd9babd0-9a0b-47d8-95a0-a131e19d852b' },
      },
      // Exclude users blocking the current user
      blocking: {
        none: { blockedId: 'fd9babd0-9a0b-47d8-95a0-a131e19d852b' },
      },
      // Exclude users blocked by the current user
      blockedBy: {
        none: { blockerId: 'fd9babd0-9a0b-47d8-95a0-a131e19d852b' },
      },
    },
    include: {
      profiles: true,
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
