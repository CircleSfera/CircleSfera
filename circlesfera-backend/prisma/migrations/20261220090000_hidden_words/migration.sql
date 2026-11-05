-- The words, phrases and emojis a Profile hides from the comments on its
-- posts. Only adds: a table, erased with its Profile, and a flag on comments.
CREATE TABLE "hidden_words" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hidden_words_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hidden_words_profileId_word_key" ON "hidden_words"("profileId", "word");

ALTER TABLE "hidden_words" ADD CONSTRAINT "hidden_words_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments" ADD COLUMN "hiddenByWords" BOOLEAN NOT NULL DEFAULT false;
