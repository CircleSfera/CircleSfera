-- Idempotent User→Profile ownership sync (data-safe).
-- Skips when posts.profileId already exists. Backfills profileId from profiles.userId
-- before NOT NULL constraints. Remaps legacy user FK columns to profile ids.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'userId'
  ) THEN
    RAISE NOTICE 'user_profile_ownership_sync: posts.userId absent — running idempotent FK/index repair only';
  END IF;
END
$migration$;

-- Helper: rename userId → profileId with backfill
CREATE OR REPLACE FUNCTION pg_temp._cs_user_col_to_profile(p_table text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'userId'
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE %I ADD COLUMN IF NOT EXISTS "profileId" TEXT',
    p_table
  );
  EXECUTE format(
    'UPDATE %I AS t SET "profileId" = p.id FROM profiles p WHERE p."userId" = t."userId" AND (t."profileId" IS NULL OR NOT EXISTS (SELECT 1 FROM profiles p2 WHERE p2.id = t."profileId"))',
    p_table
  );
  EXECUTE format('DELETE FROM %I WHERE "profileId" IS NULL', p_table);
  EXECUTE format(
    'ALTER TABLE %I ALTER COLUMN "profileId" SET NOT NULL',
    p_table
  );
  EXECUTE format(
    'ALTER TABLE %I DROP COLUMN IF EXISTS "userId"',
    p_table
  );
END;
$$;

-- Helper: remap user id values to primary profile id for unchanged column names
CREATE OR REPLACE FUNCTION pg_temp._cs_remap_user_fk(p_table text, p_column text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'UPDATE %I AS t SET %I = p.id FROM profiles p WHERE p."userId" = t.%I AND t.%I IS DISTINCT FROM p.id',
    p_table,
    p_column,
    p_column,
    p_column
  );
END;
$$;

-- Drop legacy FKs (IF EXISTS)
ALTER TABLE IF EXISTS "blocks" DROP CONSTRAINT IF EXISTS "blocks_blockedId_fkey";
ALTER TABLE IF EXISTS "blocks" DROP CONSTRAINT IF EXISTS "blocks_blockerId_fkey";
ALTER TABLE IF EXISTS "bookmarks" DROP CONSTRAINT IF EXISTS "bookmarks_userId_fkey";
ALTER TABLE IF EXISTS "close_friends" DROP CONSTRAINT IF EXISTS "close_friends_userId_fkey";
ALTER TABLE IF EXISTS "close_friends" DROP CONSTRAINT IF EXISTS "close_friends_friendId_fkey";
ALTER TABLE IF EXISTS "collections" DROP CONSTRAINT IF EXISTS "collections_userId_fkey";
ALTER TABLE IF EXISTS "comment_likes" DROP CONSTRAINT IF EXISTS "comment_likes_userId_fkey";
ALTER TABLE IF EXISTS "comments" DROP CONSTRAINT IF EXISTS "comments_userId_fkey";
ALTER TABLE IF EXISTS "edit_projects" DROP CONSTRAINT IF EXISTS "edit_projects_userId_fkey";
ALTER TABLE IF EXISTS "feed_hidden_authors" DROP CONSTRAINT IF EXISTS "feed_hidden_authors_authorId_fkey";
ALTER TABLE IF EXISTS "feed_hidden_authors" DROP CONSTRAINT IF EXISTS "feed_hidden_authors_userId_fkey";
ALTER TABLE IF EXISTS "feed_hidden_posts" DROP CONSTRAINT IF EXISTS "feed_hidden_posts_userId_fkey";
ALTER TABLE IF EXISTS "feed_muted_keywords" DROP CONSTRAINT IF EXISTS "feed_muted_keywords_userId_fkey";
ALTER TABLE IF EXISTS "follows" DROP CONSTRAINT IF EXISTS "follows_followerId_fkey";
ALTER TABLE IF EXISTS "follows" DROP CONSTRAINT IF EXISTS "follows_followingId_fkey";
ALTER TABLE IF EXISTS "highlights" DROP CONSTRAINT IF EXISTS "highlights_userId_fkey";
ALTER TABLE IF EXISTS "likes" DROP CONSTRAINT IF EXISTS "likes_userId_fkey";
ALTER TABLE IF EXISTS "live_streams" DROP CONSTRAINT IF EXISTS "live_streams_coHostId_fkey";
ALTER TABLE IF EXISTS "live_streams" DROP CONSTRAINT IF EXISTS "live_streams_hostId_fkey";
ALTER TABLE IF EXISTS "message_reactions" DROP CONSTRAINT IF EXISTS "message_reactions_userId_fkey";
ALTER TABLE IF EXISTS "messages" DROP CONSTRAINT IF EXISTS "messages_senderId_fkey";
ALTER TABLE IF EXISTS "mutes" DROP CONSTRAINT IF EXISTS "mutes_mutedId_fkey";
ALTER TABLE IF EXISTS "mutes" DROP CONSTRAINT IF EXISTS "mutes_muterId_fkey";
ALTER TABLE IF EXISTS "notifications" DROP CONSTRAINT IF EXISTS "notifications_recipientId_fkey";
ALTER TABLE IF EXISTS "notifications" DROP CONSTRAINT IF EXISTS "notifications_senderId_fkey";
ALTER TABLE IF EXISTS "participants" DROP CONSTRAINT IF EXISTS "participants_userId_fkey";
ALTER TABLE IF EXISTS "poll_votes" DROP CONSTRAINT IF EXISTS "poll_votes_userId_fkey";
ALTER TABLE IF EXISTS "post_tags" DROP CONSTRAINT IF EXISTS "post_tags_userId_fkey";
ALTER TABLE IF EXISTS "post_views" DROP CONSTRAINT IF EXISTS "post_views_viewerId_fkey";
ALTER TABLE IF EXISTS "posts" DROP CONSTRAINT IF EXISTS "posts_userId_fkey";
ALTER TABLE IF EXISTS "qna_answers" DROP CONSTRAINT IF EXISTS "qna_answers_userId_fkey";
ALTER TABLE IF EXISTS "reports" DROP CONSTRAINT IF EXISTS "reports_reporterId_fkey";
ALTER TABLE IF EXISTS "search_history" DROP CONSTRAINT IF EXISTS "search_history_userId_fkey";
ALTER TABLE IF EXISTS "stories" DROP CONSTRAINT IF EXISTS "stories_userId_fkey";
ALTER TABLE IF EXISTS "story_reactions" DROP CONSTRAINT IF EXISTS "story_reactions_userId_fkey";
ALTER TABLE IF EXISTS "story_views" DROP CONSTRAINT IF EXISTS "story_views_viewerId_fkey";
ALTER TABLE IF EXISTS "user_metrics" DROP CONSTRAINT IF EXISTS "user_metrics_userId_fkey";

-- Drop legacy indexes (IF EXISTS)
DROP INDEX IF EXISTS "bookmarks_userId_createdAt_idx";
DROP INDEX IF EXISTS "bookmarks_userId_postId_key";
DROP INDEX IF EXISTS "close_friends_userId_friendId_key";
DROP INDEX IF EXISTS "close_friends_userId_idx";
DROP INDEX IF EXISTS "collections_userId_idx";
DROP INDEX IF EXISTS "comment_likes_commentId_userId_key";
DROP INDEX IF EXISTS "comment_likes_userId_idx";
DROP INDEX IF EXISTS "comments_userId_idx";
DROP INDEX IF EXISTS "edit_projects_userId_updatedAt_idx";
DROP INDEX IF EXISTS "feed_hidden_authors_userId_authorId_key";
DROP INDEX IF EXISTS "feed_hidden_authors_userId_idx";
DROP INDEX IF EXISTS "feed_hidden_posts_userId_idx";
DROP INDEX IF EXISTS "feed_hidden_posts_userId_postId_key";
DROP INDEX IF EXISTS "feed_muted_keywords_userId_idx";
DROP INDEX IF EXISTS "feed_muted_keywords_userId_keyword_key";
DROP INDEX IF EXISTS "highlights_userId_idx";
DROP INDEX IF EXISTS "likes_postId_userId_key";
DROP INDEX IF EXISTS "likes_userId_createdAt_idx";
DROP INDEX IF EXISTS "message_reactions_messageId_userId_key";
DROP INDEX IF EXISTS "participants_conversationId_userId_key";
DROP INDEX IF EXISTS "poll_votes_pollId_userId_key";
DROP INDEX IF EXISTS "post_tags_postId_userId_key";
DROP INDEX IF EXISTS "post_tags_userId_idx";
DROP INDEX IF EXISTS "posts_userId_type_visibility_createdAt_moderationStatus_idx";
DROP INDEX IF EXISTS "profiles_userId_key";
DROP INDEX IF EXISTS "search_history_userId_idx";
DROP INDEX IF EXISTS "stories_userId_createdAt_idx";
DROP INDEX IF EXISTS "stories_userId_expiresAt_idx";
DROP INDEX IF EXISTS "story_reactions_storyId_userId_key";
DROP INDEX IF EXISTS "users_suspendedUntil_idx";

-- userId → profileId tables (with backfill)
SELECT pg_temp._cs_user_col_to_profile('bookmarks');
SELECT pg_temp._cs_user_col_to_profile('close_friends');
SELECT pg_temp._cs_user_col_to_profile('collections');
SELECT pg_temp._cs_user_col_to_profile('comment_likes');
SELECT pg_temp._cs_user_col_to_profile('comments');
SELECT pg_temp._cs_user_col_to_profile('edit_projects');
SELECT pg_temp._cs_user_col_to_profile('feed_hidden_authors');
SELECT pg_temp._cs_user_col_to_profile('feed_hidden_posts');
SELECT pg_temp._cs_user_col_to_profile('feed_muted_keywords');
SELECT pg_temp._cs_user_col_to_profile('highlights');
SELECT pg_temp._cs_user_col_to_profile('likes');
SELECT pg_temp._cs_user_col_to_profile('message_reactions');
SELECT pg_temp._cs_user_col_to_profile('participants');
SELECT pg_temp._cs_user_col_to_profile('poll_votes');
SELECT pg_temp._cs_user_col_to_profile('post_tags');
SELECT pg_temp._cs_user_col_to_profile('posts');
SELECT pg_temp._cs_user_col_to_profile('qna_answers');
SELECT pg_temp._cs_user_col_to_profile('search_history');
SELECT pg_temp._cs_user_col_to_profile('stories');
SELECT pg_temp._cs_user_col_to_profile('story_reactions');

-- Remap user ids → profile ids where column names stay the same
SELECT pg_temp._cs_remap_user_fk('follows', 'followerId');
SELECT pg_temp._cs_remap_user_fk('follows', 'followingId');
SELECT pg_temp._cs_remap_user_fk('blocks', 'blockerId');
SELECT pg_temp._cs_remap_user_fk('blocks', 'blockedId');
SELECT pg_temp._cs_remap_user_fk('mutes', 'muterId');
SELECT pg_temp._cs_remap_user_fk('mutes', 'mutedId');
SELECT pg_temp._cs_remap_user_fk('notifications', 'recipientId');
SELECT pg_temp._cs_remap_user_fk('notifications', 'senderId');
SELECT pg_temp._cs_remap_user_fk('messages', 'senderId');
SELECT pg_temp._cs_remap_user_fk('live_streams', 'hostId');
SELECT pg_temp._cs_remap_user_fk('live_streams', 'coHostId');
SELECT pg_temp._cs_remap_user_fk('reports', 'reporterId');
SELECT pg_temp._cs_remap_user_fk('story_views', 'viewerId');
SELECT pg_temp._cs_remap_user_fk('post_views', 'viewerId');
SELECT pg_temp._cs_remap_user_fk('feed_hidden_authors', 'authorId');
SELECT pg_temp._cs_remap_user_fk('close_friends', 'friendId');

-- Profile / user account fields
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "accountBanReason" TEXT;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "isAccountBanned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "suspendedUntil" TIMESTAMP(3);

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isRootBanned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rootBanReason" TEXT;
ALTER TABLE "users" DROP COLUMN IF EXISTS "suspendedUntil";

DROP TABLE IF EXISTS "user_metrics";

CREATE TABLE IF NOT EXISTS "profile_metrics" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "profile_metrics_profileId_date_key" ON "profile_metrics"("profileId", "date");

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "bookmarks_profileId_createdAt_idx" ON "bookmarks"("profileId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "bookmarks_profileId_postId_key" ON "bookmarks"("profileId", "postId");
CREATE INDEX IF NOT EXISTS "close_friends_profileId_idx" ON "close_friends"("profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "close_friends_profileId_friendId_key" ON "close_friends"("profileId", "friendId");
CREATE INDEX IF NOT EXISTS "collections_profileId_idx" ON "collections"("profileId");
CREATE INDEX IF NOT EXISTS "comment_likes_profileId_idx" ON "comment_likes"("profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "comment_likes_commentId_profileId_key" ON "comment_likes"("commentId", "profileId");
CREATE INDEX IF NOT EXISTS "comments_profileId_idx" ON "comments"("profileId");
CREATE INDEX IF NOT EXISTS "edit_projects_profileId_updatedAt_idx" ON "edit_projects"("profileId", "updatedAt");
CREATE INDEX IF NOT EXISTS "feed_hidden_authors_profileId_idx" ON "feed_hidden_authors"("profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "feed_hidden_authors_profileId_authorId_key" ON "feed_hidden_authors"("profileId", "authorId");
CREATE INDEX IF NOT EXISTS "feed_hidden_posts_profileId_idx" ON "feed_hidden_posts"("profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "feed_hidden_posts_profileId_postId_key" ON "feed_hidden_posts"("profileId", "postId");
CREATE INDEX IF NOT EXISTS "feed_muted_keywords_profileId_idx" ON "feed_muted_keywords"("profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "feed_muted_keywords_profileId_keyword_key" ON "feed_muted_keywords"("profileId", "keyword");
CREATE INDEX IF NOT EXISTS "highlights_profileId_idx" ON "highlights"("profileId");
CREATE INDEX IF NOT EXISTS "likes_profileId_createdAt_idx" ON "likes"("profileId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "likes_postId_profileId_key" ON "likes"("postId", "profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_messageId_profileId_key" ON "message_reactions"("messageId", "profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "participants_conversationId_profileId_key" ON "participants"("conversationId", "profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "poll_votes_pollId_profileId_key" ON "poll_votes"("pollId", "profileId");
CREATE INDEX IF NOT EXISTS "post_tags_profileId_idx" ON "post_tags"("profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "post_tags_postId_profileId_key" ON "post_tags"("postId", "profileId");
CREATE INDEX IF NOT EXISTS "posts_profileId_type_visibility_createdAt_moderationStatus_idx" ON "posts"("profileId", "type", "visibility", "createdAt", "moderationStatus");
CREATE INDEX IF NOT EXISTS "search_history_profileId_idx" ON "search_history"("profileId");
CREATE INDEX IF NOT EXISTS "stories_profileId_expiresAt_idx" ON "stories"("profileId", "expiresAt");
CREATE INDEX IF NOT EXISTS "stories_profileId_createdAt_idx" ON "stories"("profileId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "story_reactions_storyId_profileId_key" ON "story_reactions"("storyId", "profileId");

-- FKs to profiles (drop first if wrong target, then add)
ALTER TABLE "posts" DROP CONSTRAINT IF EXISTS "posts_profileId_fkey";
ALTER TABLE "posts" ADD CONSTRAINT "posts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_tags" DROP CONSTRAINT IF EXISTS "post_tags_profileId_fkey";
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stories" DROP CONSTRAINT IF EXISTS "stories_profileId_fkey";
ALTER TABLE "stories" ADD CONSTRAINT "stories_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_views" DROP CONSTRAINT IF EXISTS "story_views_viewerId_fkey";
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_reactions" DROP CONSTRAINT IF EXISTS "story_reactions_profileId_fkey";
ALTER TABLE "story_reactions" ADD CONSTRAINT "story_reactions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "highlights" DROP CONSTRAINT IF EXISTS "highlights_profileId_fkey";
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_profileId_fkey";
ALTER TABLE "comments" ADD CONSTRAINT "comments_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "likes" DROP CONSTRAINT IF EXISTS "likes_profileId_fkey";
ALTER TABLE "likes" ADD CONSTRAINT "likes_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comment_likes" DROP CONSTRAINT IF EXISTS "comment_likes_profileId_fkey";
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "follows" DROP CONSTRAINT IF EXISTS "follows_followerId_fkey";
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follows" DROP CONSTRAINT IF EXISTS "follows_followingId_fkey";
ALTER TABLE "follows" ADD CONSTRAINT "follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blocks" DROP CONSTRAINT IF EXISTS "blocks_blockerId_fkey";
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blocks" DROP CONSTRAINT IF EXISTS "blocks_blockedId_fkey";
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mutes" DROP CONSTRAINT IF EXISTS "mutes_muterId_fkey";
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muterId_fkey" FOREIGN KEY ("muterId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mutes" DROP CONSTRAINT IF EXISTS "mutes_mutedId_fkey";
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_mutedId_fkey" FOREIGN KEY ("mutedId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "close_friends" DROP CONSTRAINT IF EXISTS "close_friends_profileId_fkey";
ALTER TABLE "close_friends" ADD CONSTRAINT "close_friends_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "close_friends" DROP CONSTRAINT IF EXISTS "close_friends_friendId_fkey";
ALTER TABLE "close_friends" ADD CONSTRAINT "close_friends_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bookmarks" DROP CONSTRAINT IF EXISTS "bookmarks_profileId_fkey";
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "collections" DROP CONSTRAINT IF EXISTS "collections_profileId_fkey";
ALTER TABLE "collections" ADD CONSTRAINT "collections_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "search_history" DROP CONSTRAINT IF EXISTS "search_history_profileId_fkey";
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "edit_projects" DROP CONSTRAINT IF EXISTS "edit_projects_profileId_fkey";
ALTER TABLE "edit_projects" ADD CONSTRAINT "edit_projects_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "live_streams" DROP CONSTRAINT IF EXISTS "live_streams_hostId_fkey";
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "live_streams" DROP CONSTRAINT IF EXISTS "live_streams_coHostId_fkey";
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_coHostId_fkey" FOREIGN KEY ("coHostId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "poll_votes" DROP CONSTRAINT IF EXISTS "poll_votes_profileId_fkey";
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "qna_answers" DROP CONSTRAINT IF EXISTS "qna_answers_profileId_fkey";
ALTER TABLE "qna_answers" ADD CONSTRAINT "qna_answers_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "participants" DROP CONSTRAINT IF EXISTS "participants_profileId_fkey";
ALTER TABLE "participants" ADD CONSTRAINT "participants_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_senderId_fkey";
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_reactions" DROP CONSTRAINT IF EXISTS "message_reactions_profileId_fkey";
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_recipientId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_senderId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_reporterId_fkey";
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feed_hidden_posts" DROP CONSTRAINT IF EXISTS "feed_hidden_posts_profileId_fkey";
ALTER TABLE "feed_hidden_posts" ADD CONSTRAINT "feed_hidden_posts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feed_hidden_authors" DROP CONSTRAINT IF EXISTS "feed_hidden_authors_profileId_fkey";
ALTER TABLE "feed_hidden_authors" ADD CONSTRAINT "feed_hidden_authors_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_hidden_authors" DROP CONSTRAINT IF EXISTS "feed_hidden_authors_authorId_fkey";
ALTER TABLE "feed_hidden_authors" ADD CONSTRAINT "feed_hidden_authors_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feed_muted_keywords" DROP CONSTRAINT IF EXISTS "feed_muted_keywords_profileId_fkey";
ALTER TABLE "feed_muted_keywords" ADD CONSTRAINT "feed_muted_keywords_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_views" DROP CONSTRAINT IF EXISTS "post_views_viewerId_fkey";
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "profile_metrics" DROP CONSTRAINT IF EXISTS "profile_metrics_profileId_fkey";
ALTER TABLE "profile_metrics" ADD CONSTRAINT "profile_metrics_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
