-- Self-service account deactivation marker. Distinguishes a user's own
-- reversible deactivation from moderation deactivation (isActive=false set by
-- staff) and from scheduled deletion (deletedAt/scheduledDeletionAt), so login
-- can reactivate only self-deactivated accounts. Additive and nullable.
ALTER TABLE "users" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
