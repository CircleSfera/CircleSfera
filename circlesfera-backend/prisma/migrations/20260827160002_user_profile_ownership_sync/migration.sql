-- Idempotent User→Profile ownership sync.
-- Runs only when public.posts still has "userId" (fresh migrate deploy from old history).
-- No-ops on DBs that already completed the Profile split.

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'userId'
  ) THEN
    EXECUTE $sql$
-- DropForeignKey
ALTER TABLE "blocks" DROP CONSTRAINT "blocks_blockedId_fkey";

-- DropForeignKey
ALTER TABLE "blocks" DROP CONSTRAINT "blocks_blockerId_fkey";

-- DropForeignKey
ALTER TABLE "bookmarks" DROP CONSTRAINT "bookmarks_userId_fkey";

-- DropForeignKey
ALTER TABLE "close_friends" DROP CONSTRAINT "close_friends_userId_fkey";

-- DropForeignKey
ALTER TABLE "collections" DROP CONSTRAINT "collections_userId_fkey";

-- DropForeignKey
ALTER TABLE "comment_likes" DROP CONSTRAINT "comment_likes_userId_fkey";

-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_userId_fkey";

-- DropForeignKey
ALTER TABLE "edit_projects" DROP CONSTRAINT "edit_projects_userId_fkey";

-- DropForeignKey
ALTER TABLE "feed_hidden_authors" DROP CONSTRAINT "feed_hidden_authors_authorId_fkey";

-- DropForeignKey
ALTER TABLE "feed_hidden_authors" DROP CONSTRAINT "feed_hidden_authors_userId_fkey";

-- DropForeignKey
ALTER TABLE "feed_hidden_posts" DROP CONSTRAINT "feed_hidden_posts_userId_fkey";

-- DropForeignKey
ALTER TABLE "feed_muted_keywords" DROP CONSTRAINT "feed_muted_keywords_userId_fkey";

-- DropForeignKey
ALTER TABLE "follows" DROP CONSTRAINT "follows_followerId_fkey";

-- DropForeignKey
ALTER TABLE "follows" DROP CONSTRAINT "follows_followingId_fkey";

-- DropForeignKey
ALTER TABLE "highlights" DROP CONSTRAINT "highlights_userId_fkey";

-- DropForeignKey
ALTER TABLE "likes" DROP CONSTRAINT "likes_userId_fkey";

-- DropForeignKey
ALTER TABLE "live_streams" DROP CONSTRAINT "live_streams_coHostId_fkey";

-- DropForeignKey
ALTER TABLE "live_streams" DROP CONSTRAINT "live_streams_hostId_fkey";

-- DropForeignKey
ALTER TABLE "message_reactions" DROP CONSTRAINT "message_reactions_userId_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_senderId_fkey";

-- DropForeignKey
ALTER TABLE "mutes" DROP CONSTRAINT "mutes_mutedId_fkey";

-- DropForeignKey
ALTER TABLE "mutes" DROP CONSTRAINT "mutes_muterId_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_senderId_fkey";

-- DropForeignKey
ALTER TABLE "participants" DROP CONSTRAINT "participants_userId_fkey";

-- DropForeignKey
ALTER TABLE "poll_votes" DROP CONSTRAINT "poll_votes_userId_fkey";

-- DropForeignKey
ALTER TABLE "post_tags" DROP CONSTRAINT "post_tags_userId_fkey";

-- DropForeignKey
ALTER TABLE "post_views" DROP CONSTRAINT "post_views_viewerId_fkey";

-- DropForeignKey
ALTER TABLE "posts" DROP CONSTRAINT "posts_userId_fkey";

-- DropForeignKey
ALTER TABLE "qna_answers" DROP CONSTRAINT "qna_answers_userId_fkey";

-- DropForeignKey
ALTER TABLE "reports" DROP CONSTRAINT "reports_reporterId_fkey";

-- DropForeignKey
ALTER TABLE "search_history" DROP CONSTRAINT "search_history_userId_fkey";

-- DropForeignKey
ALTER TABLE "stories" DROP CONSTRAINT "stories_userId_fkey";

-- DropForeignKey
ALTER TABLE "story_reactions" DROP CONSTRAINT "story_reactions_userId_fkey";

-- DropForeignKey
ALTER TABLE "story_views" DROP CONSTRAINT "story_views_viewerId_fkey";

-- DropForeignKey
ALTER TABLE "user_metrics" DROP CONSTRAINT "user_metrics_userId_fkey";

-- DropIndex
DROP INDEX "bookmarks_userId_createdAt_idx";

-- DropIndex
DROP INDEX "bookmarks_userId_postId_key";

-- DropIndex
DROP INDEX "close_friends_userId_friendId_key";

-- DropIndex
DROP INDEX "close_friends_userId_idx";

-- DropIndex
DROP INDEX "collections_userId_idx";

-- DropIndex
DROP INDEX "comment_likes_commentId_userId_key";

-- DropIndex
DROP INDEX "comment_likes_userId_idx";

-- DropIndex
DROP INDEX "comments_userId_idx";

-- DropIndex
DROP INDEX "edit_projects_userId_updatedAt_idx";

-- DropIndex
DROP INDEX "feed_hidden_authors_userId_authorId_key";

-- DropIndex
DROP INDEX "feed_hidden_authors_userId_idx";

-- DropIndex
DROP INDEX "feed_hidden_posts_userId_idx";

-- DropIndex
DROP INDEX "feed_hidden_posts_userId_postId_key";

-- DropIndex
DROP INDEX "feed_muted_keywords_userId_idx";

-- DropIndex
DROP INDEX "feed_muted_keywords_userId_keyword_key";

-- DropIndex
DROP INDEX "highlights_userId_idx";

-- DropIndex
DROP INDEX "likes_postId_userId_key";

-- DropIndex
DROP INDEX "likes_userId_createdAt_idx";

-- DropIndex
DROP INDEX "message_reactions_messageId_userId_key";

-- DropIndex
DROP INDEX "participants_conversationId_userId_key";

-- DropIndex
DROP INDEX "poll_votes_pollId_userId_key";

-- DropIndex
DROP INDEX "post_tags_postId_userId_key";

-- DropIndex
DROP INDEX "post_tags_userId_idx";

-- DropIndex
DROP INDEX "posts_userId_type_visibility_createdAt_moderationStatus_idx";

-- DropIndex
DROP INDEX "profiles_userId_key";

-- DropIndex
DROP INDEX "search_history_userId_idx";

-- DropIndex
DROP INDEX "stories_userId_createdAt_idx";

-- DropIndex
DROP INDEX "stories_userId_expiresAt_idx";

-- DropIndex
DROP INDEX "story_reactions_storyId_userId_key";

-- DropIndex
DROP INDEX "users_suspendedUntil_idx";

-- AlterTable
ALTER TABLE "bookmarks" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "close_friends" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "collections" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "comment_likes" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "comments" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "edit_projects" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "feed_hidden_authors" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "feed_hidden_posts" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "feed_muted_keywords" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "highlights" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "likes" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "message_reactions" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "participants" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "poll_votes" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "post_tags" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "posts" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "accountBanReason" TEXT,
ADD COLUMN     "isAccountBanned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspendedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "qna_answers" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "search_history" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stories" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "story_reactions" DROP COLUMN "userId",
ADD COLUMN     "profileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "suspendedUntil",
ADD COLUMN     "isRootBanned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rootBanReason" TEXT;

-- DropTable
DROP TABLE "user_metrics";

-- CreateTable
CREATE TABLE "profile_metrics" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "following" INTEGER NOT NULL DEFAULT 0,
    "posts" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "profile_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_metrics_profileId_date_key" ON "profile_metrics"("profileId", "date");

-- CreateIndex
CREATE INDEX "bookmarks_profileId_createdAt_idx" ON "bookmarks"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_profileId_postId_key" ON "bookmarks"("profileId", "postId");

-- CreateIndex
CREATE INDEX "close_friends_profileId_idx" ON "close_friends"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "close_friends_profileId_friendId_key" ON "close_friends"("profileId", "friendId");

-- CreateIndex
CREATE INDEX "collections_profileId_idx" ON "collections"("profileId");

-- CreateIndex
CREATE INDEX "comment_likes_profileId_idx" ON "comment_likes"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "comment_likes_commentId_profileId_key" ON "comment_likes"("commentId", "profileId");

-- CreateIndex
CREATE INDEX "comments_profileId_idx" ON "comments"("profileId");

-- CreateIndex
CREATE INDEX "edit_projects_profileId_updatedAt_idx" ON "edit_projects"("profileId", "updatedAt");

-- CreateIndex
CREATE INDEX "feed_hidden_authors_profileId_idx" ON "feed_hidden_authors"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "feed_hidden_authors_profileId_authorId_key" ON "feed_hidden_authors"("profileId", "authorId");

-- CreateIndex
CREATE INDEX "feed_hidden_posts_profileId_idx" ON "feed_hidden_posts"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "feed_hidden_posts_profileId_postId_key" ON "feed_hidden_posts"("profileId", "postId");

-- CreateIndex
CREATE INDEX "feed_muted_keywords_profileId_idx" ON "feed_muted_keywords"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "feed_muted_keywords_profileId_keyword_key" ON "feed_muted_keywords"("profileId", "keyword");

-- CreateIndex
CREATE INDEX "highlights_profileId_idx" ON "highlights"("profileId");

-- CreateIndex
CREATE INDEX "likes_profileId_createdAt_idx" ON "likes"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "likes_postId_profileId_key" ON "likes"("postId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "message_reactions_messageId_profileId_key" ON "message_reactions"("messageId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "participants_conversationId_profileId_key" ON "participants"("conversationId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_pollId_profileId_key" ON "poll_votes"("pollId", "profileId");

-- CreateIndex
CREATE INDEX "post_tags_profileId_idx" ON "post_tags"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "post_tags_postId_profileId_key" ON "post_tags"("postId", "profileId");

-- CreateIndex
CREATE INDEX "posts_profileId_type_visibility_createdAt_moderationStatus_idx" ON "posts"("profileId", "type", "visibility", "createdAt", "moderationStatus");

-- CreateIndex
CREATE INDEX "search_history_profileId_idx" ON "search_history"("profileId");

-- CreateIndex
CREATE INDEX "stories_profileId_expiresAt_idx" ON "stories"("profileId", "expiresAt");

-- CreateIndex
CREATE INDEX "stories_profileId_createdAt_idx" ON "stories"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "story_reactions_storyId_profileId_key" ON "story_reactions"("storyId", "profileId");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_reactions" ADD CONSTRAINT "story_reactions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muterId_fkey" FOREIGN KEY ("muterId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_mutedId_fkey" FOREIGN KEY ("mutedId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "close_friends" ADD CONSTRAINT "close_friends_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edit_projects" ADD CONSTRAINT "edit_projects_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_coHostId_fkey" FOREIGN KEY ("coHostId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qna_answers" ADD CONSTRAINT "qna_answers_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_hidden_posts" ADD CONSTRAINT "feed_hidden_posts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_hidden_authors" ADD CONSTRAINT "feed_hidden_authors_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_hidden_authors" ADD CONSTRAINT "feed_hidden_authors_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_muted_keywords" ADD CONSTRAINT "feed_muted_keywords_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
$sql$;
  ELSE
    RAISE NOTICE 'skip user_profile_ownership_sync: posts.profileId already present';
  END IF;
END
$migration$;
