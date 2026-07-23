-- AlterEnum: add DIRECT_LIVE_GIFT
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'DIRECT_LIVE_GIFT';

-- AlterTable transactions: optional liveStreamId
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "liveStreamId" TEXT;

-- CreateTable live_gifts
CREATE TABLE IF NOT EXISTS "live_gifts" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "stripeCheckoutSessionId" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "live_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable feed_hidden_posts
CREATE TABLE IF NOT EXISTS "feed_hidden_posts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_hidden_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable feed_hidden_authors
CREATE TABLE IF NOT EXISTS "feed_hidden_authors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_hidden_authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable feed_muted_keywords
CREATE TABLE IF NOT EXISTS "feed_muted_keywords" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_muted_keywords_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "live_gifts_stripeCheckoutSessionId_key" ON "live_gifts"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "live_gifts_transactionId_key" ON "live_gifts"("transactionId");
CREATE INDEX IF NOT EXISTS "live_gifts_streamId_idx" ON "live_gifts"("streamId");
CREATE INDEX IF NOT EXISTS "live_gifts_senderId_idx" ON "live_gifts"("senderId");
CREATE INDEX IF NOT EXISTS "live_gifts_receiverId_idx" ON "live_gifts"("receiverId");
CREATE INDEX IF NOT EXISTS "live_gifts_status_idx" ON "live_gifts"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "feed_hidden_posts_userId_postId_key" ON "feed_hidden_posts"("userId", "postId");
CREATE INDEX IF NOT EXISTS "feed_hidden_posts_userId_idx" ON "feed_hidden_posts"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "feed_hidden_authors_userId_authorId_key" ON "feed_hidden_authors"("userId", "authorId");
CREATE INDEX IF NOT EXISTS "feed_hidden_authors_userId_idx" ON "feed_hidden_authors"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "feed_muted_keywords_userId_keyword_key" ON "feed_muted_keywords"("userId", "keyword");
CREATE INDEX IF NOT EXISTS "feed_muted_keywords_userId_idx" ON "feed_muted_keywords"("userId");

CREATE INDEX IF NOT EXISTS "transactions_liveStreamId_idx" ON "transactions"("liveStreamId");
CREATE INDEX IF NOT EXISTS "live_streams_hostId_idx" ON "live_streams"("hostId");

DO $$ BEGIN
  ALTER TABLE "live_gifts" ADD CONSTRAINT "live_gifts_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "live_streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "live_gifts" ADD CONSTRAINT "live_gifts_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "live_gifts" ADD CONSTRAINT "live_gifts_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "live_gifts" ADD CONSTRAINT "live_gifts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_liveStreamId_fkey" FOREIGN KEY ("liveStreamId") REFERENCES "live_streams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "feed_hidden_posts" ADD CONSTRAINT "feed_hidden_posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "feed_hidden_posts" ADD CONSTRAINT "feed_hidden_posts_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "feed_hidden_authors" ADD CONSTRAINT "feed_hidden_authors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "feed_hidden_authors" ADD CONSTRAINT "feed_hidden_authors_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "feed_muted_keywords" ADD CONSTRAINT "feed_muted_keywords_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
