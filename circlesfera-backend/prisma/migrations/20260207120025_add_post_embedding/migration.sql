-- CreateTable
CREATE TABLE "post_embeddings" (
    "postId" TEXT NOT NULL,

    CONSTRAINT "post_embeddings_pkey" PRIMARY KEY ("postId")
);

-- AddForeignKey
ALTER TABLE "post_embeddings" ADD CONSTRAINT "post_embeddings_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
