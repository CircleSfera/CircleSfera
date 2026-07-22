-- Interactive (polls / QnA), live streams, and voice note columns missing from production.

DO $$ BEGIN
  CREATE TYPE "LiveStatus" AS ENUM ('LIVE', 'ENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "live_streams" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "coHostId" TEXT,
    "title" TEXT,
    "status" "LiveStatus" NOT NULL DEFAULT 'LIVE',
    "viewerCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "hlsUrl" TEXT,
    "replayUrl" TEXT,
    CONSTRAINT "live_streams_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "live_streams_status_idx" ON "live_streams"("status");
CREATE INDEX IF NOT EXISTS "live_streams_coHostId_idx" ON "live_streams"("coHostId");

DO $$ BEGIN
  ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_hostId_fkey"
    FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_coHostId_fkey"
    FOREIGN KEY ("coHostId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "polls" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "storyId" TEXT,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "polls_postId_key" ON "polls"("postId");
CREATE UNIQUE INDEX IF NOT EXISTS "polls_storyId_key" ON "polls"("storyId");

DO $$ BEGIN
  ALTER TABLE "polls" ADD CONSTRAINT "polls_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "polls" ADD CONSTRAINT "polls_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "poll_votes" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "poll_votes_pollId_userId_key" ON "poll_votes"("pollId", "userId");
CREATE INDEX IF NOT EXISTS "poll_votes_pollId_idx" ON "poll_votes"("pollId");

DO $$ BEGIN
  ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_pollId_fkey"
    FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "qna_boxes" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "storyId" TEXT,
    "prompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "qna_boxes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "qna_boxes_postId_key" ON "qna_boxes"("postId");
CREATE UNIQUE INDEX IF NOT EXISTS "qna_boxes_storyId_key" ON "qna_boxes"("storyId");

DO $$ BEGIN
  ALTER TABLE "qna_boxes" ADD CONSTRAINT "qna_boxes_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "qna_boxes" ADD CONSTRAINT "qna_boxes_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "qna_answers" (
    "id" TEXT NOT NULL,
    "qnaBoxId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "qna_answers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "qna_answers_qnaBoxId_idx" ON "qna_answers"("qnaBoxId");

DO $$ BEGIN
  ALTER TABLE "qna_answers" ADD CONSTRAINT "qna_answers_qnaBoxId_fkey"
    FOREIGN KEY ("qnaBoxId") REFERENCES "qna_boxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "qna_answers" ADD CONSTRAINT "qna_answers_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "voiceUrl" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "voiceDuration" INTEGER;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "voiceWaveform" JSONB;

ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "voiceUrl" TEXT;
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "voiceDuration" INTEGER;
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "voiceWaveform" JSONB;
