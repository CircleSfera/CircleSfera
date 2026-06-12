import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Testing Semantic Search...');

  // Create a random search embedding
  const queryEmbedding = Array.from(
    { length: 1536 },
    () => (Math.random() * 2 - 1) * 0.1,
  );

  const results = await prisma.$queryRaw<
    { postId: string; similarity: number }[]
  >`
    SELECT 
      pe."postId",
      1 - (pe.vector <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM post_embeddings pe
    WHERE pe.vector IS NOT NULL
    ORDER BY pe.vector <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT 5;
  `;

  console.log(`Found ${results.length} results.`);

  for (const res of results) {
    const post = await prisma.post.findUnique({
      where: { id: res.postId },
      select: { caption: true },
    });
    console.log(
      `- [${res.similarity.toFixed(4)}] ${post?.caption?.substring(0, 50)}...`,
    );
  }

  console.log('✅ Semantic search verification complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
